import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { fail } from '../utils/response';
import { isUserBanned, isDeviceBanned } from '../modules/moderation/moderation.service';
import { isTokenRevoked } from '../modules/moderation/revocation.service';

// Extend Express Request to carry the authenticated user's id and role.
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: string };
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    fail(res, 'Authentication required', 401);
    return;
  }

  const token = header.slice(7);

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };

    // Reject tokens issued before an admin-triggered force-logout.
    if (payload.iat && (await isTokenRevoked(payload.sub, payload.iat))) {
      fail(res, 'Session revoked. Please log in again.', 401);
      return;
    }

    // Reject requests from banned users (covers tokens issued before the ban)
    if (await isUserBanned(payload.sub)) {
      fail(res, 'Your account has been suspended.', 403);
      return;
    }

    // Reject requests from banned devices. Mobile sends `X-Device-Id` on
    // every request via the axios interceptor; missing header just skips
    // this check (web/admin panel doesn't send it).
    const headerDeviceId = req.headers['x-device-id'];
    const deviceId = Array.isArray(headerDeviceId) ? headerDeviceId[0] : headerDeviceId;
    if (deviceId && (await isDeviceBanned(deviceId))) {
      fail(res, 'This device has been banned.', 403);
      return;
    }

    next();
  } catch {
    fail(res, 'Invalid or expired token', 401);
  }
}

// Like authenticate but does not reject — just attaches user if token is valid, not revoked, and not banned.
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const payload = verifyAccessToken(header.slice(7));
      const revoked = payload.iat ? await isTokenRevoked(payload.sub, payload.iat) : false;
      if (!revoked && !(await isUserBanned(payload.sub))) {
        req.user = { id: payload.sub, role: payload.role };
      }
    } catch {
      // ignore invalid token — treat as unauthenticated
    }
  }
  next();
}

// Middleware factory — restricts access to one or more roles.
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      fail(res, 'Forbidden', 403);
      return;
    }
    next();
  };
}
