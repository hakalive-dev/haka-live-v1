import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';
import { logAdminAction } from '../../utils/audit';
import { createNotification } from '../notifications/notifications.service';
import { insertServerDirectMessage } from '../chat/chat.service';
import { getHakaTeamUserId } from '../../constants/haka-team';
import { getIO } from '../../sockets';
import { resolveAgentUserId } from './agency-resolve';

const CHANGE_REQ_INCLUDE = {
  user: { select: { id: true, displayName: true, username: true, avatar: true } },
} as const;

function emitToUser(userId: string, event: string, payload: Record<string, unknown>) {
  try {
    getIO().to(`user:${userId}`).emit(event, payload);
  } catch {
    /* Socket.io not initialized (tests) */
  }
}

/** Shared create path for leave/change (hosts routes + agency change-request). */
export async function createPendingAgencyChangeRequest(
  hostId: string,
  type: 'leave' | 'change',
  newAgentRaw: string | null,
  reason: string,
) {
  const host = await prisma.user.findUnique({
    where: { id: hostId },
    select: { id: true, role: true, agentId: true },
  });
  if (!host) throw new AppError('User not found', 404);
  if (host.role !== 'host') throw new AppError('Only hosts can submit agency change requests', 403);
  if (!host.agentId) {
    throw new AppError(
      type === 'leave' ? 'You are not attached to an agency' : 'Join an agency before requesting a change',
      400,
    );
  }

  let toAgentId: string | null = null;
  if (type === 'change') {
    if (!newAgentRaw?.trim()) throw new AppError('Target agent is required', 400);
    const resolved = await resolveAgentUserId(newAgentRaw);
    if (!resolved) throw new AppError('Target agent not found', 404);
    if (resolved === host.agentId) throw new AppError('You are already under this agent', 400);
    toAgentId = resolved;
  }

  const existing = await prisma.agencyChangeRequest.findFirst({
    where: { userId: hostId, status: 'pending' },
  });
  if (existing) throw new AppError('You already have a pending agency request', 409);

  const row = await prisma.agencyChangeRequest.create({
    data: {
      userId: hostId,
      fromAgentId: host.agentId,
      toAgentId,
      type,
      reason: reason ?? '',
      status: 'pending',
    },
    include: CHANGE_REQ_INCLUDE,
  });

  if (row.fromAgentId) {
    void createNotification(
      row.fromAgentId,
      'agency_change_request',
      type === 'leave' ? 'Host requested to leave agency' : 'Host requested agency change',
      `${row.user.displayName}: ${(reason ?? '').slice(0, 160)}${(reason ?? '').length > 160 ? '…' : ''}`,
      { requestId: row.id, type: row.type, hostId: row.userId },
    ).catch(() => {});

    void insertServerDirectMessage({
      senderId: getHakaTeamUserId(),
      recipientId: row.fromAgentId,
      content: `${row.user.displayName} requested to ${type === 'leave' ? 'leave your agency' : 'change agency'}.${(reason ?? '').trim() ? ` Reason: ${(reason ?? '').slice(0, 160)}` : ''}`,
      messageType: 'agency_change_request',
      skipRecipientNotify: true,
    }).catch(() => {});

    emitToUser(row.fromAgentId, 'agency:host_change_request', {
      requestId: row.id,
      type: row.type,
      hostId: row.userId,
      hostName: row.user.displayName,
    });
  }

  return row;
}

// ── Host-facing ───────────────────────────────────────────────────────────────

export async function submitChangeRequest(
  hostId: string,
  type: 'leave' | 'change',
  toAgentIdRaw: string | null,
  reason: string,
) {
  return createPendingAgencyChangeRequest(
    hostId,
    type,
    type === 'change' ? toAgentIdRaw : null,
    reason,
  );
}

export async function getMyChangeRequest(hostId: string) {
  return prisma.agencyChangeRequest.findFirst({
    where: { userId: hostId, status: 'pending' },
    include: {
      user: { select: { id: true, displayName: true, username: true, avatar: true } },
    },
  });
}

export async function cancelChangeRequest(hostId: string, requestId: string) {
  const req = await prisma.agencyChangeRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new AppError('Request not found', 404);
  if (req.userId !== hostId) throw new AppError('Not your request', 403);
  if (req.status !== 'pending') throw new AppError('Only pending requests can be cancelled', 400);
  return prisma.agencyChangeRequest.delete({ where: { id: requestId } });
}

// ── Agent-facing (current agency owner approves) ─────────────────────────────

export async function listPendingChangeRequestsForAgent(agentUserId: string) {
  return prisma.agencyChangeRequest.findMany({
    where: { fromAgentId: agentUserId, status: 'pending' },
    orderBy: { createdAt: 'asc' },
    include: {
      user: { select: { id: true, displayName: true, username: true, avatar: true, hakaId: true } },
    },
  });
}

export async function agentApproveChangeRequest(agentUserId: string, requestId: string) {
  const req = await prisma.agencyChangeRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new AppError('Request not found', 404);
  if (req.status !== 'pending') throw new AppError('Request is no longer pending', 400);
  if (req.fromAgentId !== agentUserId) throw new AppError('Not authorized to approve this request', 403);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: req.userId },
      data: { agentId: req.toAgentId ?? null },
    }),
    prisma.agencyChangeRequest.update({
      where: { id: requestId },
      data: { status: 'approved' },
    }),
  ]);

  emitToUser(req.userId, 'host:stats_tick', { reason: 'agency_change_approved' });

  return { approved: true };
}

export async function agentRejectChangeRequest(agentUserId: string, requestId: string, note: string) {
  const req = await prisma.agencyChangeRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new AppError('Request not found', 404);
  if (req.status !== 'pending') throw new AppError('Request is no longer pending', 400);
  if (req.fromAgentId !== agentUserId) throw new AppError('Not authorized to reject this request', 403);

  await prisma.agencyChangeRequest.update({
    where: { id: requestId },
    data: { status: 'rejected', reason: note || 'Rejected by agent' },
  });

  emitToUser(req.userId, 'host:stats_tick', { reason: 'agency_change_rejected' });

  return { rejected: true };
}

// ── Admin-facing ──────────────────────────────────────────────────────────────

export async function adminListChangeRequests(status?: string) {
  const where = status ? { status } : {};
  return prisma.agencyChangeRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, displayName: true, username: true, avatar: true, hakaId: true } },
    },
  });
}

export async function adminApproveChangeRequest(
  adminId: string,
  requestId: string,
  ipAddress?: string,
) {
  const req = await prisma.agencyChangeRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new AppError('Request not found', 404);
  if (req.status !== 'pending') throw new AppError('Request is no longer pending', 400);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: req.userId },
      data: { agentId: req.toAgentId ?? null },
    });
    await tx.agencyChangeRequest.update({
      where: { id: requestId },
      data: { status: 'approved' },
    });
    await tx.hostAgencyOwnershipChange.create({
      data: {
        hostId: req.userId,
        fromAgentId: req.fromAgentId ?? null,
        toAgentId: req.toAgentId ?? null,
        changedByAdminId: adminId,
        reason: (req.reason ?? '').trim(),
      },
    });
  });

  emitToUser(req.userId, 'host:stats_tick', { reason: 'agency_change_approved' });

  await logAdminAction(
    adminId, 'agency.change_request_approve', 'AgencyChangeRequest', requestId,
    { type: req.type, userId: req.userId, fromAgentId: req.fromAgentId, toAgentId: req.toAgentId },
    ipAddress,
  );

  return { approved: true };
}

export async function adminRejectChangeRequest(
  adminId: string,
  requestId: string,
  reason: string,
  ipAddress?: string,
) {
  const req = await prisma.agencyChangeRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new AppError('Request not found', 404);
  if (req.status !== 'pending') throw new AppError('Request is no longer pending', 400);

  await prisma.agencyChangeRequest.update({
    where: { id: requestId },
    data: { status: 'rejected', reason },
  });

  emitToUser(req.userId, 'host:stats_tick', { reason: 'agency_change_rejected' });

  await logAdminAction(
    adminId, 'agency.change_request_reject', 'AgencyChangeRequest', requestId,
    { type: req.type, userId: req.userId, reason },
    ipAddress,
  );

  return { rejected: true };
}
