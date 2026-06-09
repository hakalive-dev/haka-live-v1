import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';
import { logAdminAction } from '../../utils/audit';
import { createNotification } from '../notifications/notifications.service';
import { insertServerDirectMessage } from '../chat/chat.service';
import { getHakaTeamUserId } from '../../constants/haka-team';
import { getIO } from '../../sockets';
import { emitAdminManagementChanged } from '../../sockets/admin-realtime';
import { ADMIN_ROLES, rolesOf } from '../../shared-types/roles';
import { resolveAgentUserId } from './agency-resolve';
import { loadBindableAgencyForOwner } from './agency.service';
import { resolveActiveDesignatedAdminByHakaId } from '../admin/designated-become-agency-admins/designated-become-agency-admins.service';

const APP_SELECT = {
  id: true, userId: true, proposedName: true, country: true,
  parentAgentId: true, designatedAdminId: true, status: true, note: true, reviewedAt: true,
  createdAt: true, updatedAt: true,
  user: { select: { id: true, displayName: true, username: true, avatar: true, hakaId: true } },
  parentAgent: { select: { id: true, displayName: true, username: true, hakaId: true } },
  designatedAdmin: { select: { id: true, displayName: true, hakaId: true } },
} as const;

function emitToUser(userId: string, event: string, payload: Record<string, unknown>) {
  try {
    getIO().to(`user:${userId}`).emit(event, payload);
  } catch {
    /* Socket.io not initialized (tests) */
  }
}

function notifyAdminManagementAgencyCreated(
  agencyId: string,
  bdId: string | null | undefined,
  extra: Record<string, unknown> = {},
) {
  emitAdminManagementChanged({ agencyId, ...(bdId ? { bdId } : {}), ...extra });
}

/** Shared DB promotion: pending AgentApplication → approved + user is agent + child agency (when parent set). */
export async function finalizeApprovedAgentApplication(
  appId: string,
  note: string,
) {
  const app = await prisma.agentApplication.findUnique({
    where: { id: appId },
    include: { user: { select: { id: true, role: true } } },
  });
  if (!app) throw new AppError('Application not found', 404);
  if (app.status !== 'pending') throw new AppError('Application is no longer pending', 400);

  const existingAgency = await prisma.agency.findUnique({ where: { ownerId: app.userId } });
  if (existingAgency) throw new AppError('User already owns an agency', 400);

  if (!app.parentAgentId) {
    throw new AppError('Application has no parent agency', 400);
  }

  const parentAgencyRow = await loadBindableAgencyForOwner(app.parentAgentId);
  if (!parentAgencyRow) throw new AppError('Parent agency not found', 400);
  const parentAgency = { id: parentAgencyRow.id };

  const wasHost = app.user.role === 'host';

  await prisma.$transaction([
    prisma.user.update({
      where: { id: app.userId },
      data: {
        role: 'agent',
        agentId: null,
        ...(wasHost ? { hostType: '', hostApplicationPath: '' } : {}),
      },
    }),
    prisma.agency.create({
      data: {
        name: app.proposedName,
        ownerId: app.userId,
        status: 'active',
        parentAgencyId: parentAgency.id,
      },
    }),
    prisma.agentApplication.update({
      where: { id: appId },
      data: { status: 'approved', note, reviewedAt: new Date() },
    }),
  ]);

  emitToUser(app.userId, 'agency:agent_application_result', {
    applicationId: appId,
    status: 'approved',
  });

  void createNotification(
    app.userId,
    'agent_application_result',
    'Application approved',
    'You are now an agent. Your sub-agency is active.',
    { applicationId: appId, status: 'approved' },
  ).catch(() => {});

  void insertServerDirectMessage({
    senderId: getHakaTeamUserId(),
    recipientId: app.userId,
    content: 'Your agent application was approved — you are now an agent and your sub-agency is active.',
    messageType: 'agent_application_result',
    skipRecipientNotify: true,
  }).catch(() => {});
}

/** Admin-only: approve application with optional null parent (root agency). */
async function finalizeApprovedAgentApplicationAdminRoot(
  appId: string,
  note: string,
  bdId?: string | null,
) {
  const app = await prisma.agentApplication.findUnique({
    where: { id: appId },
    include: { user: { select: { id: true, role: true } } },
  });
  if (!app) throw new AppError('Application not found', 404);
  if (app.status !== 'pending') throw new AppError('Application is no longer pending', 400);

  const existingAgency = await prisma.agency.findUnique({ where: { ownerId: app.userId } });
  if (existingAgency) throw new AppError('User already owns an agency', 400);

  const wasHost = app.user.role === 'host';

  const parentAgencyId = app.parentAgentId
    ? (await loadBindableAgencyForOwner(app.parentAgentId))?.id
    : undefined;

  const effectiveBdId = bdId ?? app.designatedAdminId ?? undefined;

  const designatedStaff = effectiveBdId
    ? await prisma.adminUser.findUnique({
        where: { id: effectiveBdId },
        select: { roles: true, role: true },
      })
    : null;
  const isRegionalAdmin = Boolean(
    designatedStaff && rolesOf(designatedStaff).includes(ADMIN_ROLES.ADMIN),
  );

  const createdAgency = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: app.userId },
      data: {
        role: 'agent',
        agentId: null,
        ...(wasHost ? { hostType: '', hostApplicationPath: '' } : {}),
      },
    });
    const agency = await tx.agency.create({
      data: {
        name: app.proposedName,
        ownerId: app.userId,
        status: 'active',
        ...(effectiveBdId ? { bdId: effectiveBdId } : {}),
        ...(parentAgencyId ? { parentAgencyId } : {}),
      },
      select: { id: true, bdId: true },
    });
    if (isRegionalAdmin && effectiveBdId) {
      await tx.adminAgencyAssignment.create({
        data: { agencyId: agency.id, adminId: effectiveBdId },
      });
    }
    await tx.agentApplication.update({
      where: { id: appId },
      data: { status: 'approved', note, reviewedAt: new Date() },
    });
    return agency;
  });

  notifyAdminManagementAgencyCreated(createdAgency.id, createdAgency.bdId, {
    designatedAdminId: app.designatedAdminId,
  });

  emitToUser(app.userId, 'agency:agent_application_result', {
    applicationId: appId,
    status: 'approved',
  });

  void createNotification(
    app.userId,
    'agent_application_result',
    'Application approved',
    'You are now an agent. Your agency is active.',
    { applicationId: appId, status: 'approved' },
  ).catch(() => {});

  void insertServerDirectMessage({
    senderId: getHakaTeamUserId(),
    recipientId: app.userId,
    content: 'Your agent application was approved — you are now an agent and your agency is active.',
    messageType: 'agent_application_result',
    skipRecipientNotify: true,
  }).catch(() => {});
}

/** Auto-approve root agency under a designated platform admin (Become Agency path). */
async function autoApproveRootAgentApplicationUnderDesignatedAdmin(
  userId: string,
  proposedName: string,
  country: string,
  designatedAdminId: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) throw new AppError('User not found', 404);
  if (user.role === 'agent') throw new AppError('You are already an agent', 400);

  const existingAgency = await prisma.agency.findUnique({ where: { ownerId: userId }, select: { id: true } });
  if (existingAgency) throw new AppError('You already own an agency', 400);

  const existingPending = await prisma.agentApplication.findFirst({
    where: { userId, status: 'pending' },
  });
  if (existingPending) throw new AppError('You already have a pending application', 409);

  const wasHost = user.role === 'host';
  const now = new Date();

  const designatedStaff = await prisma.adminUser.findUnique({
    where: { id: designatedAdminId },
    select: { roles: true, role: true },
  });
  const isRegionalAdmin = rolesOf(designatedStaff ?? { role: '', roles: [] }).includes(ADMIN_ROLES.ADMIN);

  const result = await prisma.$transaction(async (tx) => {
    const application = await tx.agentApplication.create({
      data: {
        userId,
        proposedName,
        country: country ?? '',
        parentAgentId: null,
        designatedAdminId,
        status: 'approved',
        note: 'auto_approved_designated_admin',
        reviewedAt: now,
      },
      select: APP_SELECT,
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        role: 'agent',
        agentId: null,
        ...(wasHost ? { hostType: '', hostApplicationPath: '' } : {}),
      },
    });

    const agency = await tx.agency.create({
      data: {
        name: proposedName,
        ownerId: userId,
        status: 'active',
        bdId: designatedAdminId,
        country: country ?? '',
      },
      select: { id: true, name: true, bdId: true },
    });

    if (isRegionalAdmin) {
      await tx.adminAgencyAssignment.create({
        data: { agencyId: agency.id, adminId: designatedAdminId },
      });
    }

    return { application, agency };
  });

  notifyAdminManagementAgencyCreated(result.agency.id, result.agency.bdId, {
    designatedAdminId,
    autoApproved: true,
  });

  emitToUser(userId, 'agency:agent_application_result', {
    applicationId: result.application.id,
    status: 'approved',
  });

  void createNotification(
    userId,
    'agent_application_result',
    'You are now an agent',
    'Your agency is active under your selected admin.',
    { applicationId: result.application.id, status: 'approved' },
  ).catch(() => {});

  void insertServerDirectMessage({
    senderId: getHakaTeamUserId(),
    recipientId: userId,
    content: 'You are now an agent — your agency is active under your selected admin.',
    messageType: 'agent_application_result',
    skipRecipientNotify: true,
  }).catch(() => {});

  return { ...result, autoApproved: true as const };
}

// ── User-facing ───────────────────────────────────────────────────────────────

export async function submitAgentApplication(
  userId: string,
  proposedName: string,
  country: string,
  parentAgentIdRaw: string | null,
  designatedAdminHakaIdRaw?: string | null,
) {
  const hasParent = Boolean(parentAgentIdRaw?.trim());
  const hasDesignatedAdmin = Boolean(designatedAdminHakaIdRaw?.trim());

  if (hasParent && hasDesignatedAdmin) {
    throw new AppError('Provide either parentAgentId or designatedAdminHakaId, not both', 400);
  }
  if (!hasParent && !hasDesignatedAdmin) {
    throw new AppError('Select an admin or enter a parent agent Haka ID', 400);
  }

  if (hasDesignatedAdmin) {
    const designated = await resolveActiveDesignatedAdminByHakaId(designatedAdminHakaIdRaw!.trim());
    return autoApproveRootAgentApplicationUnderDesignatedAdmin(
      userId,
      proposedName,
      country,
      designated.adminId,
    );
  }

  return submitSubAgentApplication(userId, proposedName, country, parentAgentIdRaw!.trim());
}

async function submitSubAgentApplication(
  userId: string,
  proposedName: string,
  country: string,
  parentAgentIdRaw: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, agentId: true },
  });
  if (!user) throw new AppError('User not found', 404);
  if (user.role === 'agent') throw new AppError('You are already an agent', 400);

  if (!parentAgentIdRaw?.trim()) {
    throw new AppError('Parent agency is required — bind to an agency first', 400);
  }

  const parentResolved = await resolveAgentUserId(parentAgentIdRaw.trim());
  if (!parentResolved) throw new AppError('Parent agent not found', 404);

  const parentAgency = await loadBindableAgencyForOwner(parentResolved);
  if (!parentAgency) throw new AppError('Parent agent not found or is not bindable', 400);

  const existingAgency = await prisma.agency.findUnique({ where: { ownerId: userId }, select: { id: true } });
  if (existingAgency) throw new AppError('You already own an agency', 400);

  const existingPending = await prisma.agentApplication.findFirst({
    where: { userId, status: 'pending' },
  });
  if (existingPending) throw new AppError('You already have a pending application', 409);

  const application = await prisma.agentApplication.create({
    data: {
      userId,
      proposedName,
      country: country ?? '',
      parentAgentId: parentResolved,
      status: 'pending',
    },
    select: APP_SELECT,
  });

  await createNotification(
    parentResolved,
    'agent_application_request',
    'Sub-agent application',
    `${application.user.displayName} wants to join under your agency as “${proposedName}”.`,
    {
      applicationId: application.id,
      applicantId: userId,
      proposedName,
      country: country ?? '',
      agencyId: parentAgency.id,
    },
  );

  const dmPayload = {
    kind: 'agent_application',
    applicationId: application.id,
    applicantId: userId,
    applicantName: application.user.displayName,
    proposedName,
    country: country ?? '',
    agencyId: parentAgency.id,
    agencyName: parentAgency.name,
  };
  await insertServerDirectMessage({
    senderId: userId,
    recipientId: parentResolved,
    content: JSON.stringify(dmPayload),
    messageType: 'agent_application',
  });

  emitToUser(parentResolved, 'agency:agent_application', {
    applicationId: application.id,
    applicantId: userId,
    applicantName: application.user.displayName,
    proposedName,
  });

  return application;
}

export async function getMyAgentApplication(userId: string) {
  return prisma.agentApplication.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: APP_SELECT,
  });
}

// ── Parent agent (agency owner) ──────────────────────────────────────────────

export async function listPendingAgentApplicationsForParent(parentAgentUserId: string) {
  return prisma.agentApplication.findMany({
    where: { parentAgentId: parentAgentUserId, status: 'pending' },
    orderBy: { createdAt: 'asc' },
    select: APP_SELECT,
  });
}

export async function approveAgentApplicationByParent(
  parentAgentUserId: string,
  appId: string,
  note: string,
) {
  const app = await prisma.agentApplication.findUnique({ where: { id: appId } });
  if (!app) throw new AppError('Application not found', 404);
  if (app.status !== 'pending') throw new AppError('Application is no longer pending', 400);
  if (app.parentAgentId !== parentAgentUserId) {
    throw new AppError('Not authorized to approve this application', 403);
  }

  await finalizeApprovedAgentApplication(appId, note || 'approved_by_parent');
  return { approved: true };
}

export async function rejectAgentApplicationByParent(
  parentAgentUserId: string,
  appId: string,
  note: string,
) {
  const app = await prisma.agentApplication.findUnique({ where: { id: appId } });
  if (!app) throw new AppError('Application not found', 404);
  if (app.status !== 'pending') throw new AppError('Application is no longer pending', 400);
  if (app.parentAgentId !== parentAgentUserId) {
    throw new AppError('Not authorized to reject this application', 403);
  }

  await prisma.agentApplication.update({
    where: { id: appId },
    data: { status: 'rejected', note: note || 'rejected_by_parent', reviewedAt: new Date() },
  });

  emitToUser(app.userId, 'agency:agent_application_result', {
    applicationId: appId,
    status: 'rejected',
  });

  void createNotification(
    app.userId,
    'agent_application_result',
    'Application not approved',
    note?.trim() || 'Your sub-agent application was not approved.',
    { applicationId: appId, status: 'rejected' },
  ).catch(() => {});

  void insertServerDirectMessage({
    senderId: getHakaTeamUserId(),
    recipientId: app.userId,
    content: note?.trim() || 'Your sub-agent application was not approved.',
    messageType: 'agent_application_result',
    skipRecipientNotify: true,
  }).catch(() => {});

  return { rejected: true };
}

// ── Admin-facing ──────────────────────────────────────────────────────────────

export async function adminListAgentApplications(status?: string) {
  return prisma.agentApplication.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: 'desc' },
    select: APP_SELECT,
  });
}

export async function adminApproveAgentApplication(
  adminId: string,
  appId: string,
  note: string,
  ipAddress?: string,
) {
  const app = await prisma.agentApplication.findUnique({ where: { id: appId }, select: { ...APP_SELECT, user: true } });
  if (!app) throw new AppError('Application not found', 404);
  if (app.status !== 'pending') throw new AppError('Application is no longer pending', 400);

  const existingAgency = await prisma.agency.findUnique({ where: { ownerId: app.userId } });
  if (existingAgency) throw new AppError('User already owns an agency', 400);

  if (app.parentAgentId) {
    await finalizeApprovedAgentApplication(appId, note);
  } else {
    await finalizeApprovedAgentApplicationAdminRoot(appId, note, app.designatedAdminId);
  }

  await logAdminAction(adminId, 'agent_application.approve', 'AgentApplication', appId,
    { userId: app.userId, proposedName: app.proposedName }, ipAddress);

  return { approved: true };
}

export async function adminRejectAgentApplication(
  adminId: string,
  appId: string,
  note: string,
  ipAddress?: string,
) {
  const app = await prisma.agentApplication.findUnique({ where: { id: appId } });
  if (!app) throw new AppError('Application not found', 404);
  if (app.status !== 'pending') throw new AppError('Application is no longer pending', 400);

  await prisma.agentApplication.update({
    where: { id: appId },
    data: { status: 'rejected', note, reviewedAt: new Date() },
  });

  emitToUser(app.userId, 'agency:agent_application_result', {
    applicationId: appId,
    status: 'rejected',
  });

  void createNotification(
    app.userId,
    'agent_application_result',
    'Application not approved',
    note?.trim() || 'Your agent application was not approved.',
    { applicationId: appId, status: 'rejected' },
  ).catch(() => {});

  void insertServerDirectMessage({
    senderId: getHakaTeamUserId(),
    recipientId: app.userId,
    content: note?.trim() || 'Your agent application was not approved.',
    messageType: 'agent_application_result',
    skipRecipientNotify: true,
  }).catch(() => {});

  await logAdminAction(adminId, 'agent_application.reject', 'AgentApplication', appId,
    { userId: app.userId, note }, ipAddress);

  return { rejected: true };
}
