import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string;   // userId
  role: string;  // primary role (back-compat)
  roles?: string[]; // all staff roles held — admin tokens only
  iat?: number;  // issued-at seconds — auto-populated by jsonwebtoken
}

// Parses the JWT_ACCESS_EXPIRY env (e.g. "15m") into seconds for jwt.sign
function expiryToSeconds(expiry: string): number {
  const unit = expiry.slice(-1);
  const value = parseInt(expiry.slice(0, -1), 10);
  const map: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * (map[unit] ?? 60);
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: expiryToSeconds(env.JWT_ACCESS_EXPIRY),
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

// Refresh tokens are opaque UUIDs stored in DB — no JWT signing needed.
// This helper calculates the expiry Date for inserting into the DB.
export function refreshTokenExpiresAt(): Date {
  const seconds = expiryToSeconds(env.JWT_REFRESH_EXPIRY);
  return new Date(Date.now() + seconds * 1000);
}

// ── Admin JWT ─────────────────────────────────────────────────────────────────
// Uses a separate secret so mobile and admin tokens are cryptographically isolated.

function adminSecret(): string {
  if (!env.ADMIN_JWT_SECRET) {
    throw new Error('ADMIN_JWT_SECRET is not configured — admin tokens cannot be signed or verified');
  }
  return env.ADMIN_JWT_SECRET;
}

export function signAdminToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, adminSecret(), {
    expiresIn: expiryToSeconds(env.JWT_ACCESS_EXPIRY),
  });
}

export function verifyAdminToken(token: string): AccessTokenPayload {
  return jwt.verify(token, adminSecret()) as AccessTokenPayload;
}
