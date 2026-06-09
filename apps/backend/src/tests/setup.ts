/**
 * Jest setupFiles — runs once before each test file is loaded.
 * Sets env vars for a REAL Postgres test database and wires ioredis-mock.
 * No Prisma mocking anywhere in this test suite.
 */

// Test DB reuses the dev docker-compose Postgres with a separate database name.
// If you run tests locally without docker, export TEST_DATABASE_URL to override.
const TEST_DB = process.env.TEST_DATABASE_URL
  ?? 'postgresql://hakalive:hakalive@localhost:5433/hakalive_test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = TEST_DB;
process.env.DIRECT_URL   = TEST_DB;
process.env.REDIS_URL    = 'redis://unused';                 // ioredis-mock ignores URL
process.env.JWT_ACCESS_SECRET  = 'test-jwt-access-secret-at-least-16';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-at-least-16';
process.env.JWT_ACCESS_EXPIRY  = '15m';
process.env.JWT_REFRESH_EXPIRY = '30d';
process.env.FIREBASE_PROJECT_ID  = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'test@test-project.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY  = 'test-private-key';
process.env.CORS_ORIGIN = '*';
process.env.PAYMENT_ENCRYPTION_KEY = '0'.repeat(64);
process.env.RAZORPAY_KEY_ID       = 'rzp_test_key';
process.env.RAZORPAY_KEY_SECRET   = 'test_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret';
process.env.ADMIN_JWT_SECRET = 'test-admin-jwt-secret-at-least-16';
process.env.ADMIN_INITIAL_EMAIL = 'admin@test.hakalive.com';
process.env.ADMIN_INITIAL_PASSWORD = 'test-admin-password-12';

// Swap ioredis for ioredis-mock so Redis-using code (combo counter) works without
// a running Redis. This is not mocking our backend API — it's a drop-in fake for
// an external service that has no local surface.
jest.mock('ioredis', () => require('ioredis-mock'));

// Firebase Admin verifies ID tokens against Google's keys; no local equivalent.
// We bypass it and trust our locally-minted JWTs (see db-helpers.mintJwt).
jest.mock('../config/firebase', () => ({
  firebaseAdmin: {
    auth: () => ({
      verifyIdToken: async (_token: string) => ({ uid: 'unused-firebase-uid' }),
    }),
  },
}));
