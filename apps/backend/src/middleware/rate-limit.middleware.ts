import { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

// Rate limiting (effectively disabled in development)
const isDev = env.NODE_ENV !== 'production';

// JSON envelope so the mobile client surfaces the message instead of the
// generic "Request failed (429)" it falls back to on a non-JSON body.
const limitMessage = {
  success: false,
  data: null,
  message: 'Too many requests, please try again later.',
};

/**
 * Bucket the global limiter by *identity*, not raw IP. Mobile carriers route
 * thousands of subscribers through a handful of carrier-grade NAT egress IPs,
 * so an IP-keyed limit makes every user on a carrier share one bucket — which
 * is exactly why normal navigation was returning 429s. Preference order:
 *   1. authenticated user (JWT `sub`)  2. device id  3. client IP (fallback).
 *
 * The limiter runs before the auth middleware, so we DECODE (not verify) the
 * bearer token purely to read its subject for bucketing. Keying needs no
 * cryptographic trust: a forged `sub` only spreads the forger's own load, and
 * without a valid signature they can't reach any protected handler anyway.
 * Keys are prefixed so a user id can never collide with a device id or IP.
 */
export function rateLimitKey(req: Request): string {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const decoded = jwt.decode(header.slice(7)) as { sub?: string } | null;
      if (decoded?.sub) return `u:${decoded.sub}`;
    } catch {
      /* malformed token — fall through to device/IP keying */
    }
  }
  const rawDeviceId = req.headers['x-device-id'];
  const deviceId = Array.isArray(rawDeviceId) ? rawDeviceId[0] : rawDeviceId;
  if (deviceId) return `d:${deviceId}`;
  return `ip:${req.ip}`;
}

/** Which bucket a key fell into — for diagnosing *why* a 429 fired without logging PII. */
export function keyType(key: string): string {
  const idx = key.indexOf(':');
  return idx > 0 ? key.slice(0, idx) : 'ip';
}

/**
 * 429 handler for the global limiter. Logs every block so we can see which
 * route/key-type actually exhausts the budget (the offender is rarely the request
 * that finally trips it), then returns the JSON envelope. The key for users is
 * `u:<uuid>` — an opaque id, not email/phone — so it's safe to log.
 */
export function handleGlobalLimit(req: Request, res: Response): void {
  const key = rateLimitKey(req);
  console.warn('[rate-limit] 429', {
    limiter: 'global',
    method: req.method,
    path: req.path,
    keyType: keyType(key),
    key,
  });
  res.status(429).json(limitMessage);
}

export const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: isDev ? 10_000 : env.RATE_LIMIT_MAX,
  message: limitMessage,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  handler: handleGlobalLimit,
});

/**
 * Strict IP-keyed limiter for CREDENTIAL endpoints only (password login, OTP
 * send/verify): brute-force protection wants per-origin limiting, and
 * device-keying would let an attacker rotate device ids for fresh buckets.
 *
 * Do NOT put routine session traffic (/refresh, /me, /logout) behind this:
 * those run for every active user every ~15 min (access-token TTL), and under
 * carrier-grade NAT all users on one carrier egress IP share a single bucket —
 * a dozen concurrent users exhaust it and everyone on that carrier gets 429s
 * (and a 429 on refresh used to log the user out). Session routes are covered
 * by the identity-keyed global limiter instead.
 */
export const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10_000 : env.AUTH_RATE_LIMIT_MAX,
  message: limitMessage,
  standardHeaders: true,
  legacyHeaders: false,
});
