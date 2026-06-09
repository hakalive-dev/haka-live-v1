import { prisma } from "../../config/prisma";
import { AppError } from "../../middleware/error.middleware";
import { createNotification } from "../notifications/notifications.service";
import { insertServerDirectMessage } from "../chat/chat.service";
import { getHakaTeamUserId } from "../../constants/haka-team";
import { getIO } from "../../sockets";
import { resolveUserIdFromPublicIdentifier } from "../users/userLookup.service";

function emitToUser(
  userId: string,
  event: string,
  payload: Record<string, unknown>,
) {
  try {
    getIO().to(`user:${userId}`).emit(event, payload);
  } catch {
    /* tests */
  }
}

export async function createSubAgentInvitation(
  inviterId: string,
  targetUserIdOrHaka: string,
  proposedAgencyName: string,
) {
  const inviter = await prisma.user.findUnique({
    where: { id: inviterId },
    select: { id: true, role: true, displayName: true },
  });
  if (!inviter || inviter.role !== "agent")
    throw new AppError("Only agents can invite sub-agents", 403);

  const inviterAgency = await prisma.agency.findUnique({
    where: { ownerId: inviterId },
    select: { id: true, name: true },
  });
  if (!inviterAgency) throw new AppError("You do not have an agency", 400);

  const inviteeId = await resolveUserIdFromPublicIdentifier(targetUserIdOrHaka);
  if (!inviteeId) throw new AppError("User not found", 404);
  if (inviteeId === inviterId)
    throw new AppError("Cannot invite yourself", 400);

  const invitee = await prisma.user.findUnique({
    where: { id: inviteeId },
    select: { id: true, role: true, displayName: true },
  });
  if (!invitee) throw new AppError("User not found", 404);
  if (invitee.role === "agent")
    throw new AppError("User is already an agent", 400);

  const existingAgency = await prisma.agency.findUnique({
    where: { ownerId: inviteeId },
    select: { id: true },
  });
  if (existingAgency) throw new AppError("User already owns an agency", 400);

  const dup = await prisma.subAgentInvitation.findFirst({
    where: { inviterId, inviteeId, status: "pending" },
  });
  if (dup)
    throw new AppError("An invitation is already pending for this user", 409);

  const name = proposedAgencyName?.trim() || `${invitee.displayName}'s Agency`;

  const row = await prisma.subAgentInvitation.create({
    data: {
      inviterId,
      inviteeId,
      proposedAgencyName: name,
      status: "pending",
    },
  });

  const dmPayload = {
    kind: "sub_agent_invite",
    invitationId: row.id,
    inviterId,
    inviterName: inviter.displayName,
    agencyId: inviterAgency.id,
    agencyName: inviterAgency.name,
    proposedAgencyName: name,
  };

  await insertServerDirectMessage({
    senderId: inviterId,
    recipientId: inviteeId,
    content: JSON.stringify(dmPayload),
    messageType: "sub_agent_invite",
  });

  void createNotification(
    inviteeId,
    "sub_agent_invite",
    "Agency invitation",
    `${inviter.displayName} invited you to become a sub-agent under ${inviterAgency.name}.`,
    { invitationId: row.id, inviterId, agencyId: inviterAgency.id },
  ).catch(() => {});

  emitToUser(inviteeId, "agency:sub_agent_invite", { invitationId: row.id });

  return row;
}

export async function acceptSubAgentInvitation(
  inviteeId: string,
  invitationId: string,
) {
  const inv = await prisma.subAgentInvitation.findUnique({
    where: { id: invitationId },
  });
  if (!inv) throw new AppError("Invitation not found", 404);
  if (inv.inviteeId !== inviteeId)
    throw new AppError("Not your invitation", 403);
  if (inv.status !== "pending")
    throw new AppError("Invitation is no longer pending", 400);

  const user = await prisma.user.findUnique({
    where: { id: inviteeId },
    select: { id: true, role: true },
  });
  if (!user) throw new AppError("User not found", 404);
  if (user.role === "agent")
    throw new AppError("You are already an agent", 400);

  const existingAgency = await prisma.agency.findUnique({
    where: { ownerId: inviteeId },
    select: { id: true },
  });
  if (existingAgency) throw new AppError("You already own an agency", 400);

  const parentAgency = await prisma.agency.findUnique({
    where: { ownerId: inv.inviterId },
    select: { id: true },
  });
  if (!parentAgency) throw new AppError("Inviter agency no longer exists", 400);

  const wasHost = user.role === "host";
  const proposedName = inv.proposedAgencyName?.trim() || "Agency";

  await prisma.$transaction([
    prisma.user.update({
      where: { id: inviteeId },
      data: {
        role: "agent",
        agentId: null,
        ...(wasHost ? { hostType: "", hostApplicationPath: "" } : {}),
      },
    }),
    prisma.agency.create({
      data: {
        name: proposedName,
        ownerId: inviteeId,
        status: "active",
        parentAgencyId: parentAgency.id,
      },
    }),
    prisma.subAgentInvitation.update({
      where: { id: invitationId },
      data: { status: "accepted" },
    }),
  ]);

  emitToUser(inv.inviterId, "agency:sub_agent_invite_result", {
    invitationId,
    status: "accepted",
    inviteeId,
  });
  emitToUser(inviteeId, "agency:sub_agent_invite_result", {
    invitationId,
    status: "accepted",
  });

  void createNotification(
    inv.inviterId,
    "sub_agent_invite_result",
    "Invitation accepted",
    "Your sub-agent invitation was accepted.",
    { invitationId, inviteeId, status: "accepted" },
  ).catch(() => {});

  void insertServerDirectMessage({
    senderId: getHakaTeamUserId(),
    recipientId: inv.inviterId,
    content: "Your sub-agent invitation was accepted.",
    messageType: "sub_agent_invite_result",
    skipRecipientNotify: true,
  }).catch(() => {});

  return { accepted: true };
}

export async function declineSubAgentInvitation(
  inviteeId: string,
  invitationId: string,
) {
  const inv = await prisma.subAgentInvitation.findUnique({
    where: { id: invitationId },
  });
  if (!inv) throw new AppError("Invitation not found", 404);
  if (inv.inviteeId !== inviteeId)
    throw new AppError("Not your invitation", 403);
  if (inv.status !== "pending")
    throw new AppError("Invitation is no longer pending", 400);

  await prisma.subAgentInvitation.update({
    where: { id: invitationId },
    data: { status: "declined" },
  });

  emitToUser(inv.inviterId, "agency:sub_agent_invite_result", {
    invitationId,
    status: "declined",
    inviteeId,
  });
  void createNotification(
    inv.inviterId,
    "sub_agent_invite_result",
    "Invitation declined",
    "Your sub-agent invitation was declined.",
    { invitationId, status: "declined" },
  ).catch(() => {});

  void insertServerDirectMessage({
    senderId: getHakaTeamUserId(),
    recipientId: inv.inviterId,
    content: "Your sub-agent invitation was declined.",
    messageType: "sub_agent_invite_result",
    skipRecipientNotify: true,
  }).catch(() => {});

  return { declined: true };
}

export async function cancelSubAgentInvitation(
  inviterId: string,
  invitationId: string,
) {
  const inv = await prisma.subAgentInvitation.findUnique({
    where: { id: invitationId },
  });
  if (!inv) throw new AppError("Invitation not found", 404);
  if (inv.inviterId !== inviterId)
    throw new AppError("Not your invitation", 403);
  if (inv.status !== "pending")
    throw new AppError("Invitation is no longer pending", 400);

  await prisma.subAgentInvitation.update({
    where: { id: invitationId },
    data: { status: "cancelled" },
  });

  emitToUser(inv.inviteeId, "agency:sub_agent_invite_result", {
    invitationId,
    status: "cancelled",
  });
  return { cancelled: true };
}

export async function listPendingSubAgentInvitationsForInviter(
  inviterId: string,
) {
  return prisma.subAgentInvitation.findMany({
    where: { inviterId, status: "pending" },
    orderBy: { createdAt: "asc" },
    include: {
      invitee: {
        select: {
          id: true,
          displayName: true,
          username: true,
          avatar: true,
          hakaId: true,
        },
      },
    },
  });
}
