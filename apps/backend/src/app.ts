import express, { Request } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';

// Teach JSON.stringify how to serialize Prisma BigInt columns (e.g.
// User.cumulativeBeansEarned, Wallet.balance) — without this, any endpoint
// that returns a row containing a BigInt throws "Do not know how to serialize".
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};
import { env } from './config/env';
import { errorHandler } from './middleware/error.middleware';
import { maintenanceGate } from './middleware/maintenance.middleware';
import accountsRouter from './modules/accounts/accounts.routes';
import whatsappOtpRouter from './modules/whatsapp-otp/whatsapp-otp.routes';
import emailOtpRouter from './modules/email-otp/email-otp.routes';
import usersRouter from './modules/users/users.routes';
import roomsRouter from './modules/rooms/rooms.routes';
import chatRouter from './modules/chat/chat.routes';
import walletRouter from './modules/wallet/wallet.routes';
import giftsRouter from './modules/gifts/gifts.routes';
import levelsRouter from './modules/levels/levels.routes';
import familyRouter from './modules/family/family.routes';
import { handleAgoraWebhook } from './modules/rooms/agora.webhook';
import adminRouter from './modules/admin/admin.routes';
import paymentsRouter from './modules/payments/payments.routes';
import leaderboardRouter from './modules/leaderboard/leaderboard.routes';
import invitesRouter from './modules/invites/invites.routes';
import activityRouter from './modules/activity/activity.routes';
import notificationsRouter from './modules/notifications/notifications.routes';
import moderationRouter from './modules/moderation/moderation.routes';
import hostApplicationRouter from './modules/hostApplication/hostApplication.routes';
import agencyRouter from './modules/agency/agency.routes';
import { ownerRouter as agencyInvitationsOwnerRouter } from './modules/agency-invitations/agency-invitations.routes';
import { authenticate } from './middleware/auth.middleware';
import momentsRouter from './modules/moments/moments.routes';
import searchRouter from './modules/search/search.routes';
import storeRouter from './modules/store/store.routes';
import profileRouter from './modules/profile/profile.routes';
import hostsRouter from './modules/hosts/hosts.routes';
import settingsRouter from './modules/settings/settings.routes';
import blocklistRouter from './modules/blocklist/blocklist.routes';
import supportRouter from './modules/support/support.routes';
import bannersRouter from './modules/banners/banners.routes';
import themesRouter from './modules/themes/themes.routes';
import pkRouter from './modules/pk/pk.routes';
import normalBattleRouter from './modules/normal-battle/normal-battle.routes';
import payrollAgentRouter from './modules/payroll-agent/payroll-agent.routes';
import faceVerificationRouter from './modules/face-verification/face-verification.routes';
import musicRouter from './modules/music/music.routes';

const app = express();

// Trust Render/nginx reverse proxy so rate-limit sees real client IP
app.set('trust proxy', 1);

// ── Security & logging ────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting (disabled in development) ───────────────────────────────────
const isDev = env.NODE_ENV !== 'production';

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
function rateLimitKey(req: Request): string {
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

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10_000 : env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
});
app.use(limiter);

// Auth stays IP-keyed on purpose: brute-force protection wants per-origin
// limiting, and device-keying would let an attacker rotate device ids for
// fresh buckets. Kept stricter than the global limiter.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 10_000 : env.AUTH_RATE_LIMIT_MAX,
  message: { success: false, data: null, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Root + health ───────────────────────────────────────────────────────────
// The API base path has no UI; without this, GET / falls through to the 404
// handler. Return a friendly 200 so browsers, uptime monitors, and scanners
// hitting the bare domain get an OK instead of a logged 404.
app.get('/', (_req, res) => {
  res.json({ success: true, data: { name: 'Haka Live API', status: 'ok' }, message: '' });
});

app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' }, message: '' });
});

// ── Global kill switch ────────────────────────────────────────────────────────
// When maintenance mode is active (super_admin toggle, Redis-backed), every
// user-facing route returns 503. The gate self-allow-lists /health, the admin
// SPA, and the admin API so the switch is always reversible.
app.use(maintenanceGate);

// ── API routes ────────────────────────────────────────────────────────────────
// WhatsApp OTP routes must mount BEFORE accountsRouter: accountsRouter's path-less
// `router.use(authenticate)` would otherwise intercept the public /whatsapp/* routes.
app.use('/api/v1/auth',  authLimiter, whatsappOtpRouter);
app.use('/api/v1/auth',  authLimiter, emailOtpRouter);
app.use('/api/v1/auth',  authLimiter, accountsRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/profile', profileRouter);
app.use('/api/v1/face-verification', faceVerificationRouter);
app.use('/api/v1/rooms', roomsRouter);
app.use('/api/v1/music', musicRouter);
app.use('/api/v1/chat',   chatRouter);
app.use('/api/v1/wallet',  walletRouter);
app.use('/api/v1/payroll-agent', payrollAgentRouter);
app.use('/api/v1/gifts',   giftsRouter);
app.use('/api/v1/levels',  levelsRouter);
app.use('/api/v1/family',       familyRouter);
app.use('/api/v1/payments',     paymentsRouter);
app.use('/api/v1/leaderboard',  leaderboardRouter);
app.use('/api/v1/invites',       invitesRouter);
app.use('/api/v1/activity',      activityRouter);
app.use('/api/v1/notifications', notificationsRouter);
app.use('/api/v1/moderation',       moderationRouter);
app.use('/api/v1/host-application', hostApplicationRouter);
app.use('/api/v1/agency',           agencyRouter);
app.use('/api/v1/agency',           authenticate, agencyInvitationsOwnerRouter);
app.use('/api/v1/moments',          momentsRouter);
app.use('/api/v1/search',           searchRouter);
app.use('/api/v1/store',            storeRouter);
app.use('/api/v1/hosts',            hostsRouter);
app.use('/api/v1/settings',         settingsRouter);
app.use('/api/v1/blocklist',        blocklistRouter);
app.use('/api/v1/support',          supportRouter);
app.use('/api/v1/banners',          bannersRouter);
app.use('/api/v1/themes',          themesRouter);
app.use('/api/v1/pk',              pkRouter);
app.use('/api/v1/rooms', normalBattleRouter);
app.post('/api/v1/webhooks/agora', handleAgoraWebhook);

// ── Admin panel API ──────────────────────────────────────────────────────────
app.use('/api/v1/admin', adminRouter);

// ── Serve admin SPA ─────────────────────────────────────────────────────────
import path from 'path';
import fs from 'fs';

// Check multiple possible locations for the admin dist
const adminCandidates = [
  '/admin-dist',                                    // Dev docker: host-mounted admin/dist
  path.join(__dirname, 'admin-dist'),              // Docker: dist/admin-dist/ (embedded via cp in builder)
  path.join(__dirname, '../admin-dist'),           // Docker fallback: /app/admin-dist
  path.join(__dirname, '../../admin/dist'),        // Dev: apps/backend/dist/../../admin/dist
  path.join(process.cwd(), 'admin-dist'),          // cwd-relative fallback
  path.join(process.cwd(), '../admin/dist'),       // Render native: cwd is apps/backend
];
const adminDistPath = adminCandidates.find(p => fs.existsSync(p)) ?? adminCandidates[0];
console.log('[admin] candidates:', adminCandidates.map(p => `${p} (${fs.existsSync(p) ? 'EXISTS' : 'missing'})`));
console.log('[admin] resolved path:', adminDistPath);
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/tag-icons', express.static(path.join(adminDistPath, 'tag-icons')));
app.use('/admin', express.static(adminDistPath, { index: 'index.html' }));
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(adminDistPath, 'index.html'));
});
app.get('/admin/*', (_req, res) => {
  res.sendFile(path.join(adminDistPath, 'index.html'));
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, data: null, message: 'Route not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

export default app;
