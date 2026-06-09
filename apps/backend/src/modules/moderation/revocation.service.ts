import { redis } from '../../config/redis';
import { getIO } from '../../sockets';

/**
 * Per-user token revocation. Any access JWT whose `iat` is older than the
 * stored timestamp is rejected — effectively logging the user out on their
 * next request, without waiting for the 15-min JWT expiry.
 *
 * Also broadcasts a `user:force_logout` Socket.io event so connected clients
 * can drop immediately.
 */

const KEY = (userId: string) => `auth:revoked:${userId}`;
// Keep the entry alive for longer than the longest possible access-token TTL.
const TTL_SECONDS = 60 * 60 * 24 * 2; // 2 days

export async function revokeUserTokens(userId: string): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  await redis.set(KEY(userId), String(nowSec), 'EX', TTL_SECONDS);
}

export async function getRevokedAt(userId: string): Promise<number> {
  const raw = await redis.get(KEY(userId));
  return raw ? parseInt(raw, 10) : 0;
}

export async function isTokenRevoked(userId: string, iatSec: number): Promise<boolean> {
  const revokedAt = await getRevokedAt(userId);
  return revokedAt > 0 && iatSec < revokedAt;
}

/**
 * Revoke all tokens for `userId`, push a `user:force_logout` event so any
 * compliant client drops the session immediately, and then forcibly close
 * every connected socket in that user's personal room. This guarantees a
 * malicious or buggy client cannot keep emitting room/chat events after a
 * ban or password reset.
 */
export async function forceLogout(userId: string, reason = 'session_revoked'): Promise<void> {
  await revokeUserTokens(userId);
  try {
    const io = getIO();
    io.to(`user:${userId}`).emit('user:force_logout', { reason });
    // Hard-disconnect — runs after the emit so the client receives the event
    // before the socket closes (Socket.io flushes the buffer first).
    await io.in(`user:${userId}`).disconnectSockets(true);
  } catch {
    // Socket.io not initialized (e.g. inside a test or seed script) — ignore.
  }
}
