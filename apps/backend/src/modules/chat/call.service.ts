/**
 * 1:1 video call state machine.
 *
 * Lifecycle: ringing → answered → ended
 *                    ↘ declined | cancelled (caller hung up) | missed (40s timeout) | busy
 *
 * Every transition is idempotent (guarded `updateMany` on the prior status), signals the
 * peer over socket AND a mirrored FCM data push (sockets die silently on stale tokens),
 * and terminal states drop a `call_log` DM into the thread like Messenger.
 *
 * Ring timeouts use the same in-process timer + boot recovery pattern as pk.service.
 */
import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';
import { getIO } from '../../sockets';
import { CALL_EVENTS, type CallType } from '../../shared-types';
import { generateRtcToken, getOrAssignUid } from '../rooms/agora.service';
import {
  userAcceptsCalls,
  sendIncomingCallPush,
  sendCallSignalPush,
} from '../notifications/notifications.service';
import { assertCannotReplyToSystemDm } from './haka-team-guard';
import { deriveCallChannelName } from './call-channel';
import { insertServerDirectMessage } from './chat.service';

export const RING_TIMEOUT_MS = 40_000;
/** A ringing row older than this is stale (e.g. process died) — never blocks new calls. */
const STALE_RINGING_MS = 60_000;
/** An answered call with no call-end after this long is presumed dead (app killed mid-call). */
const STALE_ANSWERED_MS = 4 * 60 * 60_000;

const ringTimers = new Map<string, NodeJS.Timeout>();

type CallRow = { id: string; callerId: string; calleeId: string };
type CallOutcome = 'ended' | 'missed' | 'declined';

function emitToUser(userId: string, event: string, payload: Record<string, unknown>) {
  try {
    getIO().to(`user:${userId}`).emit(event, payload);
  } catch {
    /* tests / no io */
  }
}

async function callerName(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
  return u?.displayName?.trim() || 'Someone';
}

async function assertCanSignalCall(callerId: string, calleeId: string) {
  if (callerId === calleeId) throw new AppError('Invalid call target', 400);
  const callee = await prisma.user.findUnique({ where: { id: calleeId }, select: { id: true } });
  if (!callee) throw new AppError('User not found', 404);
  const block = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { actorId: callerId, targetId: calleeId },
        { actorId: calleeId, targetId: callerId },
      ],
    },
    select: { id: true },
  });
  if (block) throw new AppError('You cannot call this user', 403);
}

/** Most recent live (non-stale) call the user is part of, if any. */
async function findLiveCallForUser(userId: string) {
  const now = Date.now();
  return prisma.call.findFirst({
    where: {
      OR: [{ calleeId: userId }, { callerId: userId }],
      AND: [
        {
          OR: [
            { status: 'ringing', startedAt: { gte: new Date(now - STALE_RINGING_MS) } },
            { status: 'answered', answeredAt: { gte: new Date(now - STALE_ANSWERED_MS) } },
          ],
        },
      ],
    },
    orderBy: { startedAt: 'desc' },
  });
}

/** Terminal-state call log dropped into the DM thread (sender is always the caller). */
async function insertCallLog(call: CallRow, outcome: CallOutcome, durationSeconds?: number) {
  const content = JSON.stringify({
    kind: 'call_log',
    callType: 'video',
    outcome,
    ...(durationSeconds != null ? { durationSeconds } : {}),
  });
  try {
    await insertServerDirectMessage({
      senderId: call.callerId,
      recipientId: call.calleeId,
      content,
      messageType: 'call_log',
      // Missed calls stay unread so the callee gets badged; the rest are informational.
      isRead: outcome !== 'missed',
      // The dedicated call pushes already ring/notify — don't double-push a DM.
      skipRecipientNotify: true,
      alsoEmitToSender: true,
    });
  } catch {
    /* call log is best-effort */
  }
}

function scheduleRingTimeout(callId: string, delayMs: number) {
  cancelRingTimer(callId);
  const timer = setTimeout(() => {
    void ringTimeoutFired(callId).catch(() => {
      /* call may have settled already */
    });
  }, delayMs);
  ringTimers.set(callId, timer);
}

function cancelRingTimer(callId: string) {
  const t = ringTimers.get(callId);
  if (t) {
    clearTimeout(t);
    ringTimers.delete(callId);
  }
}

async function ringTimeoutFired(callId: string) {
  ringTimers.delete(callId);
  const updated = await prisma.call.updateMany({
    where: { id: callId, status: 'ringing' },
    data: { status: 'missed', endedAt: new Date() },
  });
  if (updated.count === 0) return; // settled through another path

  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call) return;

  await insertCallLog(call, 'missed');
  emitToUser(call.calleeId, CALL_EVENTS.MISSED, { peerId: call.callerId, callId });
  emitToUser(call.callerId, CALL_EVENTS.MISSED, { peerId: call.calleeId, callId });

  const name = await callerName(call.callerId);
  void sendCallSignalPush(
    call.calleeId,
    { type: 'video_call_signal', signal: 'missed', callId, peerId: call.callerId, callerDisplayName: name },
    { title: 'Missed video call', body: `${name} tried to call you` },
  ).catch(() => {});
}

/**
 * Caller starts a call: rings the callee over socket + high-priority FCM and starts the
 * 40s ring timeout. Returns `busy` (no ring) when the callee is already in a call.
 * The callee mints their own Agora token on answer; the socket payload carries one too.
 */
export async function startCall(
  callerId: string,
  calleeId: string,
  callType: CallType = 'video',
): Promise<{ callId: string; status: 'ringing' | 'busy' }> {
  assertCannotReplyToSystemDm(calleeId);
  await assertCanSignalCall(callerId, calleeId);

  if (!(await userAcceptsCalls(calleeId))) {
    throw new AppError('This user has disabled calls', 403);
  }

  if (await findLiveCallForUser(callerId)) {
    throw new AppError('You are already in a call', 409);
  }

  const channel = deriveCallChannelName(callerId, calleeId);

  const liveCall = await findLiveCallForUser(calleeId);
  if (liveCall) {
    const call = await prisma.call.create({
      data: { callerId, calleeId, channelId: channel, status: 'busy', endedAt: new Date() },
    });
    await insertCallLog(call, 'missed');
    return { callId: call.id, status: 'busy' };
  }

  const name = await callerName(callerId);
  const call = await prisma.call.create({
    data: { callerId, calleeId, channelId: channel, status: 'ringing' },
  });

  const calleeUid = await getOrAssignUid(calleeId, channel);
  const { token, appId, expiresAt } = generateRtcToken(channel, calleeUid, 'publisher');

  emitToUser(calleeId, CALL_EVENTS.INCOMING, {
    callId: call.id,
    callerId,
    callerDisplayName: name,
    callType,
    channelId: channel,
    agoraToken: token,
    appId,
    uid: calleeUid,
    expiresAt: String(expiresAt),
  });

  const modeLabel = callType === 'voice' ? 'voice' : 'video';
  void sendIncomingCallPush(calleeId, `Incoming ${modeLabel} call`, `${name} is calling`, {
    type: callType === 'voice' ? 'voice_call' : 'video_call',
    callType,
    callId: call.id,
    callerId,
    callerDisplayName: name,
    channelId: channel,
  }).catch(() => {});

  scheduleRingTimeout(call.id, RING_TIMEOUT_MS);
  return { callId: call.id, status: 'ringing' };
}

/**
 * Callee answers. Throws 410 if the call already settled (cancelled/missed/answered
 * elsewhere) so the client can drop the stale ringing UI instead of joining a dead channel.
 */
export async function answerCall(calleeId: string, callerId: string): Promise<{ callId: string }> {
  const call = await prisma.call.findFirst({
    where: { callerId, calleeId, status: 'ringing' },
    orderBy: { startedAt: 'desc' },
  });
  if (!call) throw new AppError('Call is no longer ringing', 410);

  const updated = await prisma.call.updateMany({
    where: { id: call.id, status: 'ringing' },
    data: { status: 'answered', answeredAt: new Date() },
  });
  if (updated.count === 0) throw new AppError('Call is no longer ringing', 410);

  cancelRingTimer(call.id);
  return { callId: call.id };
}

/** Callee declined — notify caller (socket + silent data push). */
export async function declineCall(calleeId: string, callerId: string) {
  assertCannotReplyToSystemDm(callerId);
  await assertCanSignalCall(calleeId, callerId);

  const call = await prisma.call.findFirst({
    where: { callerId, calleeId, status: 'ringing' },
    orderBy: { startedAt: 'desc' },
  });
  if (call) {
    const updated = await prisma.call.updateMany({
      where: { id: call.id, status: 'ringing' },
      data: { status: 'declined', endedAt: new Date() },
    });
    if (updated.count > 0) {
      cancelRingTimer(call.id);
      await insertCallLog(call, 'declined');
    }
  }

  // Emit even with no live row — settles legacy callers and lost races the same way.
  emitToUser(callerId, CALL_EVENTS.DECLINED, { peerId: calleeId, callId: call?.id });
  void sendCallSignalPush(callerId, {
    type: 'video_call_signal',
    signal: 'declined',
    callId: call?.id ?? '',
    peerId: calleeId,
  }).catch(() => {});
}

/** Settle the latest answered call between the pair as ended (with duration log). */
async function settleAnsweredCall(userId: string, otherId: string) {
  const call = await prisma.call.findFirst({
    where: {
      status: 'answered',
      OR: [
        { callerId: userId, calleeId: otherId },
        { callerId: otherId, calleeId: userId },
      ],
    },
    orderBy: { startedAt: 'desc' },
  });
  if (!call) return null;

  const endedAt = new Date();
  const updated = await prisma.call.updateMany({
    where: { id: call.id, status: 'answered' },
    data: { status: 'ended', endedAt },
  });
  if (updated.count > 0) {
    const durationSeconds = call.answeredAt
      ? Math.max(0, Math.round((endedAt.getTime() - call.answeredAt.getTime()) / 1000))
      : 0;
    await insertCallLog(call, 'ended', durationSeconds);
  }
  return call;
}

/** Caller hung up before the callee answered — logs as a missed call (Messenger semantics). */
export async function cancelCall(callerId: string, calleeId: string) {
  assertCannotReplyToSystemDm(calleeId);
  await assertCanSignalCall(callerId, calleeId);

  const call = await prisma.call.findFirst({
    where: { callerId, calleeId, status: 'ringing' },
    orderBy: { startedAt: 'desc' },
  });
  let cancelled = false;
  if (call) {
    const updated = await prisma.call.updateMany({
      where: { id: call.id, status: 'ringing' },
      data: { status: 'cancelled', endedAt: new Date() },
    });
    if (updated.count > 0) {
      cancelled = true;
      cancelRingTimer(call.id);
      await insertCallLog(call, 'missed');
    }
  }

  // Lost the race with answerCall (the row is already 'answered') — settle it as
  // ended instead of leaving a zombie row that blocks future calls.
  const settledAnswered = cancelled ? null : await settleAnsweredCall(callerId, calleeId);

  emitToUser(calleeId, CALL_EVENTS.CANCELLED, {
    peerId: callerId,
    callId: call?.id ?? settledAnswered?.id,
  });
  const name = cancelled ? await callerName(callerId) : null;
  void sendCallSignalPush(
    calleeId,
    {
      type: 'video_call_signal',
      signal: 'cancelled',
      callId: call?.id ?? settledAnswered?.id ?? '',
      peerId: callerId,
      ...(name ? { callerDisplayName: name } : {}),
    },
    cancelled && name
      ? { title: 'Missed video call', body: `${name} tried to call you` }
      : undefined,
  ).catch(() => {});
}

/** Either party ended an answered call — logs duration, notifies the other side. */
export async function endCall(userId: string, otherId: string) {
  if (userId === otherId) throw new AppError('Invalid call target', 400);

  const call = await settleAnsweredCall(userId, otherId);

  emitToUser(otherId, CALL_EVENTS.ENDED, { peerId: userId, callId: call?.id });
  void sendCallSignalPush(otherId, {
    type: 'video_call_signal',
    signal: 'ended',
    callId: call?.id ?? '',
    peerId: userId,
  }).catch(() => {});
}

/** Boot recovery: re-arm (or immediately expire) ring timeouts for in-flight calls. */
export async function recoverActiveCalls() {
  const ringing = await prisma.call.findMany({ where: { status: 'ringing' } });
  for (const call of ringing) {
    const remaining = call.startedAt.getTime() + RING_TIMEOUT_MS - Date.now();
    if (remaining <= 0) {
      void ringTimeoutFired(call.id).catch(() => {});
    } else {
      scheduleRingTimeout(call.id, remaining);
    }
  }
}
