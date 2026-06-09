import { Socket } from 'socket.io';
import { verifyAccessToken, verifyAdminToken } from '../utils/jwt';
import { isTokenRevoked } from '../modules/moderation/revocation.service';
import { isUserBanned } from '../modules/moderation/moderation.service';

/**
 * Socket.io authentication middleware.
 *
 * Clients must pass their JWT as:
 *   - `auth.token` in the connection handshake, OR
 *   - `Authorization: Bearer <token>` header
 *
 * Rejects:
 *   - missing / invalid token
 *   - token revoked by admin force-logout
 *   - user is platform-banned (active Ban row)
 */
export async function authMiddleware(socket: Socket, next: (err?: Error) => void) {
  const token =
    socket.handshake.auth?.token ??
    socket.handshake.headers?.authorization?.replace('Bearer ', '');

  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const payload = verifyAccessToken(token);
    if (payload.iat && (await isTokenRevoked(payload.sub, payload.iat))) {
      return next(new Error('Session revoked'));
    }
    if (await isUserBanned(payload.sub)) {
      return next(new Error('Account suspended'));
    }
    (socket.data as any).userId = payload.sub;
    (socket.data as any).role = payload.role;
    (socket.data as any).isAdmin = false;
    next();
    socket.join(`user:${payload.sub}`);
    return;
  } catch {
    /* not a mobile/user JWT — try admin panel token */
  }

  try {
    const payload = verifyAdminToken(token);
    (socket.data as any).userId = payload.sub;
    (socket.data as any).role = payload.role;
    (socket.data as any).isAdmin = true;
    next();
    socket.join('admin:staff');
  } catch {
    next(new Error('Invalid or expired token'));
  }
}
