import { RtcTokenBuilder, RtcRole } from 'agora-access-token';
import { agoraConfig } from '../../config/agora';
import { AppError } from '../../middleware/error.middleware';
import { redis } from '../../config/redis';

/** Default token expiry: 24 hours (in seconds). */
const TOKEN_EXPIRY_SECS = 24 * 60 * 60;

/**
 * Returns true if the channel has been admin-revoked (foreclose / host ban).
 * The watermark is set in [admin-rooms.service.ts](./admin/rooms/admin-rooms.service.ts)
 * and on host-ban; we honour it on every token issue so a banned room/host
 * cannot mint fresh RTC tokens.
 */
export async function isChannelRevoked(channel: string): Promise<boolean> {
  try {
    const v = await redis.get(`agora:revoked:${channel}`);
    return Boolean(v);
  } catch {
    return false;
  }
}

export interface AgoraTokenResult {
  token: string;
  channel: string;
  uid: number;
  appId: string;
  expiresAt: number;
}

/**
 * Generate an Agora RTC token for a user joining a specific channel.
 *
 * @param channel  The Agora channel name (== room.agoraChannel == room.id).
 * @param uid      An integer UID for the user within this channel.
 *                 We derive it from the user's UUID (hash to 32-bit int).
 * @param role     'publisher' (host/speaker) or 'subscriber' (listener).
 */
export function generateRtcToken(
  channel: string,
  uid: number,
  role: 'publisher' | 'subscriber' = 'publisher',
): AgoraTokenResult {
  const { appId, appCertificate } = agoraConfig;
  if (!appId || !appCertificate) {
    throw new AppError('Agora is not configured — set AGORA_APP_ID and AGORA_APP_CERTIFICATE', 503);
  }

  const agoraRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
  const now = Math.floor(Date.now() / 1000);
  const privilegeExpireTs = now + TOKEN_EXPIRY_SECS;

  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channel,
    uid,
    agoraRole,
    privilegeExpireTs,
  );

  return {
    token,
    channel,
    uid,
    appId,
    expiresAt: privilegeExpireTs,
  };
}

/**
 * Atomically get or create a unique integer UID for (userId, channel) in Redis.
 * Uses a per-channel counter so UIDs are collision-free regardless of user count.
 * Falls back to the hash-based approach if Redis is unavailable.
 */
const GET_OR_ASSIGN_UID = `
  local uid = redis.call('HGET', KEYS[1], ARGV[1])
  if uid then return tonumber(uid) end
  local next = redis.call('INCR', KEYS[2])
  redis.call('HSET', KEYS[1], ARGV[1], next)
  redis.call('EXPIRE', KEYS[1], 86400)
  redis.call('EXPIRE', KEYS[2], 86400)
  return next
`;

export async function getOrAssignUid(userId: string, channel: string): Promise<number> {
  try {
    const uid = await redis.eval(
      GET_OR_ASSIGN_UID,
      2,
      `agora:uid_map:${channel}`,
      `agora:uid_ctr:${channel}`,
      userId,
    ) as number;
    return uid;
  } catch {
    return uidFromUuid(userId);
  }
}

/**
 * Look up an existing Agora UID for (userId, channel) without assigning a new one.
 * Returns null if the user has not yet requested an RTC token for this channel.
 */
export async function getMappedUid(userId: string, channel: string): Promise<number | null> {
  try {
    const uid = await redis.hget(`agora:uid_map:${channel}`, userId);
    if (uid == null) return null;
    const parsed = Number(uid);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return uidFromUuid(userId);
  }
}

/**
 * Batch lookup Agora RTC UIDs for multiple users in a channel.
 * Only returns entries that exist in Redis (no assignment).
 */
export async function getRtcUidMap(
  channel: string,
  userIds: string[],
): Promise<Record<string, number>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return {};
  try {
    const values = await redis.hmget(`agora:uid_map:${channel}`, ...unique);
    const result: Record<string, number> = {};
    unique.forEach((id, i) => {
      const raw = values[i];
      if (raw == null) return;
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) result[id] = parsed;
    });
    return result;
  } catch {
    const result: Record<string, number> = {};
    for (const id of unique) {
      result[id] = uidFromUuid(id);
    }
    return result;
  }
}

/**
 * @deprecated Use getOrAssignUid for collision-safe UIDs.
 * Kept for backward-compat with legacy callers.
 */
export function uidFromUuid(uuid: string): number {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    hash = ((hash << 5) - hash + uuid.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}
