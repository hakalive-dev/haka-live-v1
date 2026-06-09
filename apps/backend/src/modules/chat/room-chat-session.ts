import { redis } from '../../config/redis';

const CHAT_SESSION_TTL_SEC = 86400; // 24h — aligned with viewer set TTL

export function userRoomChatSinceKey(roomId: string, userId: string): string {
  return `room:${roomId}:user:${userId}:chatSince`;
}

/** Per-user attendance watermark: messages before this are hidden for that user. */
export async function getOrCreateUserRoomChatSince(roomId: string, userId: string): Promise<Date> {
  const key = userRoomChatSinceKey(roomId, userId);
  const existing = await redis.get(key);
  if (existing) {
    const ms = Number(existing);
    if (!Number.isNaN(ms)) return new Date(ms);
  }
  const now = Date.now();
  await redis.set(key, String(now), 'EX', CHAT_SESSION_TTL_SEC);
  return new Date(now);
}

/** Called when the user fully leaves the room (explicit leave or debounced disconnect). */
export async function clearUserRoomChatSession(roomId: string, userId: string): Promise<void> {
  await redis.del(userRoomChatSinceKey(roomId, userId));
}

export function effectiveRoomChatSince(roomClearedAt: Date | null, userSince: Date): Date {
  if (!roomClearedAt) return userSince;
  return roomClearedAt > userSince ? roomClearedAt : userSince;
}
