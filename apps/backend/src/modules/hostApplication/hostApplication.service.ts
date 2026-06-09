import { prisma } from "../../config/prisma";
import { AppError } from "../../middleware/error.middleware";
import { createNotification } from "../notifications/notifications.service";
import { getIO } from "../../sockets";
import { resolveUserIdFromPublicIdentifier } from "../users/userLookup.service";
import { insertServerDirectMessage } from "../chat/chat.service";
import { getHakaTeamUserId } from "../../constants/haka-team";

function emitHostApplicationToAgent(
  agentId: string,
  payload: Record<string, unknown>,
) {
  try {
    getIO().to(`user:${agentId}`).emit("agency:host_application", payload);
  } catch {
    /* tests */
  }
}

const APP_SELECT = {
  id: true,
  userId: true,
  agentId: true,
  path: true,
  status: true,
  note: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatar: true,
      role: true,
      hostType: true,
    },
  },
  agent: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatar: true,
    },
  },
};

/**
 * Guard: throw if user already has a pending/approved application or is already a host.
 */
async function guardAlreadyApplied(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) throw new AppError("User not found", 404);
  if (user.role === "host") throw new AppError("You are already a host");

  const existing = await prisma.hostApplication.findFirst({
    where: { userId, status: { in: ["pending", "approved"] } },
  });
  if (existing)
    throw new AppError("You already have an active host application");
}

/**
 * POST /host-application/apply-independent
 * Promotes the user to host immediately (no admin/agent approval). Writes an
 * auto-approved HostApplication for audit (path=self_apply_independent).
 */
export async function applyIndependent(userId: string) {
  await guardAlreadyApplied(userId);

  const reviewedAt = new Date();

  return prisma.$transaction(async (tx) => {
    const created = await tx.hostApplication.create({
      data: {
        userId,
        path: "self_apply_independent",
        status: "approved",
        note: "Auto-approved (independent)",
        reviewedAt,
      },
      select: { id: true },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        role: "host",
        hostType: "independent",
        hostApplicationPath: "self_apply_independent",
        agentId: null,
      },
    });

    return tx.hostApplication.findUniqueOrThrow({
      where: { id: created.id },
      select: APP_SELECT,
    });
  });
}

/**
 * POST /host-application/apply-with-agent
 * Auto-approves a host application with path=self_apply_with_agent and promotes
 * the user to host immediately.
 */
export async function applyWithAgent(userId: string, agentId: string) {
  await guardAlreadyApplied(userId);

  const resolvedAgentId = await resolveUserIdFromPublicIdentifier(agentId);
  if (!resolvedAgentId) throw new AppError("Agent not found", 404);

  const agent = await prisma.user.findUnique({
    where: { id: resolvedAgentId },
    select: { id: true, role: true, displayName: true },
  });
  if (!agent) throw new AppError("Agent not found", 404);
  if (agent.role !== "agent")
    throw new AppError("Specified user is not an agent", 400);

  const reviewedAt = new Date();

  return prisma.$transaction(async (tx) => {
    const created = await tx.hostApplication.create({
      data: {
        userId,
        agentId: agent.id,
        path: "self_apply_with_agent",
        status: "approved",
        note: "Auto-approved (self-apply with agent)",
        reviewedAt,
      },
      select: { id: true },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        role: "host",
        hostType: "agent_host",
        hostApplicationPath: "self_apply_with_agent",
        agentId: agent.id,
      },
    });

    const application = await tx.hostApplication.findUniqueOrThrow({
      where: { id: created.id },
      select: APP_SELECT,
    });

    void createNotification(
      agent.id,
      "host_joined_agency",
      "New host joined your agency",
      `${application.user.displayName} has joined as a host under your agency.`,
      { applicationId: application.id, userId, path: "self_apply_with_agent" },
    ).catch(() => {});

    void insertServerDirectMessage({
      senderId: getHakaTeamUserId(),
      recipientId: agent.id,
      content: `${application.user.displayName} has joined as a host under your agency.`,
      messageType: "host_joined_agency",
      skipRecipientNotify: true,
    }).catch(() => {});

    emitHostApplicationToAgent(agent.id, {
      applicationId: application.id,
      applicantName: application.user.displayName,
      path: "self_apply_with_agent",
    });

    return application;
  });
}

/**
 * POST /host-application/invite
 * Agent invites a user to become a host.
 * `targetUserIdOrPublic` may be internal user id, hakaId, or username (case-insensitive).
 */
export async function inviteHost(
  agentId: string,
  targetUserIdOrPublic: string,
) {
  const agent = await prisma.user.findUnique({
    where: { id: agentId },
    select: { id: true, role: true },
  });
  if (!agent) throw new AppError("Agent not found", 404);
  if (agent.role !== "agent")
    throw new AppError("Only agents can send host invitations", 403);

  const resolvedTargetId =
    await resolveUserIdFromPublicIdentifier(targetUserIdOrPublic);
  if (!resolvedTargetId) throw new AppError("Target user not found", 404);
  if (resolvedTargetId === agentId)
    throw new AppError("Cannot invite yourself", 400);

  const target = await prisma.user.findUnique({
    where: { id: resolvedTargetId },
    select: { id: true, role: true },
  });
  if (!target) throw new AppError("Target user not found", 404);
  if (target.role === "host") throw new AppError("User is already a host");

  const existing = await prisma.hostApplication.findFirst({
    where: {
      userId: resolvedTargetId,
      status: { in: ["pending", "approved"] },
    },
  });
  if (existing)
    throw new AppError("User already has an active host application");

  const application = await prisma.hostApplication.create({
    data: {
      userId: resolvedTargetId,
      agentId,
      path: "agency_invitation",
      status: "pending",
    },
    select: APP_SELECT,
  });

  void createNotification(
    resolvedTargetId,
    "host_invitation",
    "You’re invited to host",
    `${application.agent?.displayName ?? "An agent"} invited you to become a host on Haka Live.`,
    {
      applicationId: application.id,
      agentId,
      path: "agency_invitation",
    },
  ).catch(() => {});

  void insertServerDirectMessage({
    senderId: getHakaTeamUserId(),
    recipientId: resolvedTargetId,
    content: `${application.agent?.displayName ?? "An agent"} invited you to become a host on Haka Live. Open your invitations to accept or decline.`,
    messageType: "host_invitation",
    skipRecipientNotify: true,
  }).catch(() => {});

  void createNotification(
    agentId,
    "host_invitation_sent",
    "Host invitation sent",
    `Your invitation for ${application.user.displayName} to become a host is pending their review.`,
    {
      applicationId: application.id,
      userId: resolvedTargetId,
      path: "agency_invitation",
    },
  ).catch(() => {});

  void insertServerDirectMessage({
    senderId: getHakaTeamUserId(),
    recipientId: agentId,
    content: `Your invitation for ${application.user.displayName} to become a host is pending their review.`,
    messageType: "host_invitation_sent",
    skipRecipientNotify: true,
  }).catch(() => {});

  emitHostApplicationToAgent(agentId, {
    applicationId: application.id,
    applicantName: application.user.displayName,
    path: "agency_invitation",
  });

  return application;
}

/**
 * GET /host-application/me
 * Returns user's latest HostApplication.
 */
export async function getMyApplication(userId: string) {
  const application = await prisma.hostApplication.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: APP_SELECT,
  });
  if (!application) throw new AppError("No application found", 404);
  return application;
}

/**
 * GET /host-application/pending
 * Admin-facing: paginated list of pending applications.
 */
export async function getPendingApplications(page: number, limit: number) {
  const where = { status: "pending" };
  const [items, total] = await Promise.all([
    prisma.hostApplication.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      select: APP_SELECT,
    }),
    prisma.hostApplication.count({ where }),
  ]);

  return { items, total, page, limit, hasMore: page * limit < total };
}

/**
 * POST /host-application/:id/approve
 * Approves an application and upgrades the user to host.
 */
export async function approve(applicationId: string, adminNote: string) {
  const application = await prisma.hostApplication.findUnique({
    where: { id: applicationId },
    include: { user: { select: { id: true, role: true, agentId: true } } },
  });
  if (!application) throw new AppError("Application not found", 404);
  if (application.status !== "pending") {
    throw new AppError(`Application is already ${application.status}`);
  }
  if (application.path === "agency_invitation") {
    throw new AppError("Agency invitations are decided by the invitee", 403);
  }

  // Determine hostType from path
  const hostType =
    application.path === "self_apply_independent"
      ? "independent"
      : "agent_host";

  return prisma.$transaction(async (tx) => {
    // Update user: promote to host
    const userUpdate: {
      role: string;
      hostType: string;
      hostApplicationPath: string;
      agentId?: string;
    } = {
      role: "host",
      hostType,
      hostApplicationPath: application.path,
    };

    // Set agentId only if application has one and user doesn't already have one (IMMUTABLE rule)
    if (application.agentId && !application.user.agentId) {
      userUpdate.agentId = application.agentId;
    }

    await tx.user.update({
      where: { id: application.userId },
      data: userUpdate,
    });

    // Update application status
    return tx.hostApplication.update({
      where: { id: applicationId },
      data: {
        status: "approved",
        note: adminNote,
        reviewedAt: new Date(),
      },
      select: APP_SELECT,
    });
  });
}

/**
 * POST /host-application/:id/reject
 * Rejects a host application.
 */
export async function reject(applicationId: string, adminNote: string) {
  const application = await prisma.hostApplication.findUnique({
    where: { id: applicationId },
  });
  if (!application) throw new AppError("Application not found", 404);
  if (application.status !== "pending") {
    throw new AppError(`Application is already ${application.status}`);
  }

  return prisma.hostApplication.update({
    where: { id: applicationId },
    data: {
      status: "rejected",
      note: adminNote,
      reviewedAt: new Date(),
    },
    select: APP_SELECT,
  });
}

/**
 * POST /host-application/:id/accept
 * Invitee accepts an agency_invitation — promotes them to host.
 */
export async function acceptInvitation(userId: string, applicationId: string) {
  const application = await prisma.hostApplication.findUnique({
    where: { id: applicationId },
    include: { user: { select: { id: true, role: true, agentId: true } } },
  });
  if (!application) throw new AppError("Application not found", 404);
  if (application.userId !== userId)
    throw new AppError("Not authorized", 403);
  if (application.path !== "agency_invitation")
    throw new AppError("Only agency invitations can be accepted this way", 400);
  if (application.status !== "pending")
    throw new AppError(`Application is already ${application.status}`, 400);
  if (application.user.role === "host")
    throw new AppError("User is already a host", 409);

  const updatedApplication = await prisma.$transaction(async (tx) => {
    const userUpdate: {
      role: string;
      hostType: string;
      hostApplicationPath: string;
      agentId?: string;
    } = {
      role: "host",
      hostType: "agent_host",
      hostApplicationPath: "agency_invitation",
    };

    if (application.agentId && !application.user.agentId) {
      userUpdate.agentId = application.agentId;
    }

    await tx.user.update({
      where: { id: userId },
      data: userUpdate,
    });

    return tx.hostApplication.update({
      where: { id: applicationId },
      data: {
        status: "approved",
        note: "Accepted by invitee",
        reviewedAt: new Date(),
      },
      select: APP_SELECT,
    });
  });

  if (application.agentId) {
    void createNotification(
      application.agentId,
      "host_invitation_accepted",
      "Host invitation accepted",
      `${updatedApplication.user.displayName} accepted your invitation and is now a host under your agency.`,
      { applicationId: application.id, userId, path: "agency_invitation" },
    ).catch(() => {});

    void insertServerDirectMessage({
      senderId: getHakaTeamUserId(),
      recipientId: application.agentId,
      content: `${updatedApplication.user.displayName} accepted your invitation and is now a host under your agency.`,
      messageType: "host_invitation_accepted",
      skipRecipientNotify: true,
    }).catch(() => {});

    emitHostApplicationToAgent(application.agentId, {
      applicationId: application.id,
      applicantName: updatedApplication.user.displayName,
      path: "agency_invitation",
      status: "approved",
    });
  }

  return updatedApplication;
}

/**
 * POST /host-application/:id/decline
 * Invitee declines an agency_invitation — no cooldown penalty.
 */
export async function declineInvitation(userId: string, applicationId: string) {
  const application = await prisma.hostApplication.findUnique({
    where: { id: applicationId },
  });
  if (!application) throw new AppError("Application not found", 404);
  if (application.userId !== userId)
    throw new AppError("Not authorized", 403);
  if (application.path !== "agency_invitation")
    throw new AppError("Only agency invitations can be declined this way", 400);
  if (application.status !== "pending")
    throw new AppError(`Application is already ${application.status}`, 400);

  const result = await prisma.hostApplication.update({
    where: { id: applicationId },
    data: {
      status: "rejected",
      note: "Declined by invitee",
      reviewedAt: new Date(),
    },
    select: APP_SELECT,
  });

  if (application.agentId) {
    void createNotification(
      application.agentId,
      "host_invitation_declined",
      "Host invitation declined",
      `${result.user.displayName} declined your host invitation.`,
      { applicationId: application.id, userId, path: "agency_invitation" },
    ).catch(() => {});

    void insertServerDirectMessage({
      senderId: getHakaTeamUserId(),
      recipientId: application.agentId,
      content: `${result.user.displayName} declined your host invitation.`,
      messageType: "host_invitation_declined",
      skipRecipientNotify: true,
    }).catch(() => {});

    emitHostApplicationToAgent(application.agentId, {
      applicationId: application.id,
      path: "agency_invitation",
      status: "rejected",
    });
  }

  return result;
}

// ── Agent-scoped (same approve/reject semantics as admin) ─────────────────────

export async function listPendingHostApplicationsForAgent(agentUserId: string) {
  return prisma.hostApplication.findMany({
    where: { agentId: agentUserId, status: "pending" },
    orderBy: { createdAt: "asc" },
    select: APP_SELECT,
  });
}

export async function approveHostApplicationByAgent(
  agentUserId: string,
  applicationId: string,
  adminNote: string,
) {
  const application = await prisma.hostApplication.findUnique({
    where: { id: applicationId },
  });
  if (!application) throw new AppError("Application not found", 404);
  if (application.agentId !== agentUserId) {
    throw new AppError("Not authorized to approve this application", 403);
  }
  return approve(applicationId, adminNote);
}

export async function rejectHostApplicationByAgent(
  agentUserId: string,
  applicationId: string,
  adminNote: string,
) {
  const application = await prisma.hostApplication.findUnique({
    where: { id: applicationId },
  });
  if (!application) throw new AppError("Application not found", 404);
  if (application.agentId !== agentUserId) {
    throw new AppError("Not authorized to reject this application", 403);
  }
  return reject(applicationId, adminNote);
}
