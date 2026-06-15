import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().optional(),
  REDIS_URL: z.string().min(1),

  /**
   * When `false`, this process does not start node-cron scheduler jobs (leaderboard, currency, etc.).
   * Use on horizontally scaled **API** nodes when a dedicated `worker` process runs schedulers.
   * PK matchmaking still runs on API nodes (needs Socket.io); it uses Redis locks per tick.
   * Default `true` — single-service deploys keep schedulers on the API.
   */
  ENABLE_SCHEDULER: z.enum(['true', 'false']).default('true'),

  /**
   * Global per-identity request budget per `RATE_LIMIT_WINDOW_MS` (production only).
   * Keyed by user → device → IP (see app.ts), so this is a per-user budget,
   * NOT per-IP — many users behind one carrier-grade NAT IP no longer share it.
   * A short window keeps abuse protection while letting a user who briefly bursts
   * recover in minutes instead of being locked out for the whole window.
   */
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  /** Sliding the global window: shorter = faster recovery after a burst. Default 3 min. */
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(180_000),
  /** Stricter cap for /auth (login, refresh, OTP). Keyed by IP for brute-force protection. */
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(50),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('30d'),

  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email(),
  FIREBASE_PRIVATE_KEY: z.string().min(1),

  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_STORAGE_BUCKET_NAME: z.string().optional(),
  AWS_S3_REGION_NAME: z.string().optional(),

  /** Rekognition face collection for verified users (see scripts/setup-rekognition.ts). */
  REKOGNITION_FACE_COLLECTION_ID: z.string().optional(),
  /** Defaults to AWS_S3_REGION_NAME, then eu-west-1. Must match collection region. */
  REKOGNITION_REGION: z.string().optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  AGORA_APP_ID: z.string().optional(),
  AGORA_APP_CERTIFICATE: z.string().optional(),
  AGORA_NCS_SECRET: z.string().optional(), // Agora NCS webhook secret for HMAC-SHA256 verification

  CORS_ORIGIN: z.string().default('*'),

  // Admin panel
  ADMIN_JWT_SECRET: z.string().optional(),
  ADMIN_INITIAL_EMAIL: z.string().email(),
  ADMIN_INITIAL_PASSWORD: z.string().min(12),

  // Supabase Storage (for admin file uploads)
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Dev-only: password for Haka ID login (defaults to 'haka2024')
  DEV_LOGIN_PASSWORD: z.string().optional(),

  /** Must match seeded system user `system_uid_haka_team` unless overridden in DB */
  HAKA_TEAM_USER_ID: z.string().uuid().optional(),

  /** Must match seeded system user `system_uid_withdrawal_message` unless overridden in DB */
  WITHDRAWAL_MESSAGE_USER_ID: z.string().uuid().optional(),

  /** FCM topic for broadcast team announcements (mobile must subscribe to the same name) */
  FCM_TEAM_ANNOUNCEMENTS_TOPIC: z.string().default('haka_team_announcements'),

  /**
   * When `true`, run the idempotent Haka Team welcome-DM backfill on API boot
   * (inbox only — no push). Set on staging for one deploy cycle, then remove.
   */
  RUN_WELCOME_DM_BACKFILL: z.enum(['true', 'false']).default('false'),

  // Payment method encryption (32-byte hex; required in production for withdrawal bind)
  PAYMENT_ENCRYPTION_KEY: z.string().length(64).optional(),

  // ── WhatsApp OTP (Meta WhatsApp Cloud API) ────────────────────────────────────
  // Self-owned phone-login OTP delivery. Both creds required for the feature to send;
  // left optional here so the API still boots before Meta-side setup is complete.
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_TEMPLATE_NAME: z.string().default('haka_otp'),
  WHATSAPP_TEMPLATE_LANG: z.string().default('en_US'),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),

  // ── Android app-update gate (GET /api/v1/config) ──────────────────────────────
  // Drives the in-app "Update available" popup. Bump these when a new AAB ships.
  // Set MIN only when older builds must be force-updated; LATEST drives the optional
  // "what's new" nudge. 0 (default) disables that level of the gate.
  ANDROID_LATEST_VERSION_CODE: z.coerce.number().int().nonnegative().default(0),
  ANDROID_LATEST_VERSION_NAME: z.string().default(''),
  ANDROID_MIN_VERSION_CODE: z.coerce.number().int().nonnegative().default(0),
  ANDROID_STORE_URL: z
    .string()
    .default('https://play.google.com/store/apps/details?id=com.hakalive.app'),
  // Release-notes bullets, '|'-separated (newlines are awkward in env files).
  ANDROID_RELEASE_NOTES: z.string().default(''),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV !== 'production') return;

  const key = data.PAYMENT_ENCRYPTION_KEY;
  if (!key) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'PAYMENT_ENCRYPTION_KEY is required when NODE_ENV=production',
      path: ['PAYMENT_ENCRYPTION_KEY'],
    });
    return;
  }

  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'PAYMENT_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)',
      path: ['PAYMENT_ENCRYPTION_KEY'],
    });
  }
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
