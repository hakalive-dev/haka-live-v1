/**
 * Feature 1 — Auth & Accounts
 * Tests: POST /refresh, POST /logout, GET /me,
 *        PATCH /onboarding, PATCH /profile
 *
 * Prisma is fully mocked — no real DB needed.
 */

// ── Mocks (hoisted by Jest before imports) ────────────────────────────────────

jest.mock('../../config/prisma', () => {
  const user = {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const refreshToken = {
    create: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    update: jest.fn(),
  };
  // Shared inside-transaction $queryRaw. Defaults to the hakaId nextval shape used
  // by generateUniqueHakaId; refresh-token tests override it with the locked row.
  const txQueryRaw = jest.fn().mockResolvedValue([{ next_val: BigInt(500000001) }]);
  const prismaMock = {
    user,
    refreshToken,
    txQueryRaw,
    ban: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    userTag: { findMany: jest.fn().mockResolvedValue([]) },
    userDevice: { upsert: jest.fn().mockResolvedValue({}) },
    /**
     * Used by generateUniqueHakaId (advisory lock + nextval + tx.user.findUnique
     * collision check) and refreshTokens (FOR UPDATE row lock + rotate).
     */
    $transaction: jest.fn(async (fn: (tx: {
      $executeRaw: jest.Mock;
      $queryRaw: jest.Mock;
      user: typeof user;
      refreshToken: typeof refreshToken;
      adminUser: { findFirst: jest.Mock };
    }) => Promise<unknown>) =>
      fn({
        $executeRaw: jest.fn().mockResolvedValue(undefined),
        $queryRaw: txQueryRaw,
        user,
        refreshToken,
        // generateUniqueHakaId checks adminUser for hakaId collisions inside the tx.
        adminUser: { findFirst: jest.fn().mockResolvedValue(null) },
      }),
    ),
  };
  return { prisma: prismaMock };
});

// ── Imports ───────────────────────────────────────────────────────────────────

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';
import { prisma } from '../../config/prisma';

// Typed mock helpers
const mockUser = prisma.user as unknown as {
  upsert: jest.Mock;
  findUnique: jest.Mock;
  update: jest.Mock;
};
const mockRefreshToken = prisma.refreshToken as unknown as {
  create: jest.Mock;
  findUnique: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
  update: jest.Mock;
};
// The FOR UPDATE row-lock query inside refreshTokens' transaction.
const mockTxQueryRaw = (prisma as unknown as { txQueryRaw: jest.Mock }).txQueryRaw;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-jwt-access-secret-at-least-16';

function makeAccessToken(userId = 'user-1', role = 'normal_user') {
  return jwt.sign({ sub: userId, role }, JWT_SECRET, { expiresIn: '15m' });
}

const baseUser = {
  id: 'user-1',
  supabaseUid: 'supabase-uid-1',
  phone: '+1234567890',
  email: null,
  username: null,
  displayName: 'Test User',
  avatar: '',
  bio: '',
  country: '',
  city: '',
  gender: 'female',
  dateOfBirth: null,
  hakaId: null,
  role: 'normal_user',
  hostType: '',
  hostApplicationPath: '',
  agentId: null,
  onboardingComplete: false,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

// Use real UUIDs — refreshSchema validates z.string().uuid()
const REFRESH_TOKEN = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const NEW_REFRESH_TOKEN = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

const baseRefreshToken = {
  id: 'rt-1',
  token: REFRESH_TOKEN,
  userId: 'user-1',
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
  createdAt: new Date(),
};

// ── POST /api/v1/auth/refresh ─────────────────────────────────────────────────

describe('POST /api/v1/auth/refresh', () => {
  it('returns new token pair on valid refresh token', async () => {
    // FOR UPDATE row lock returns an active (un-rotated) token.
    mockTxQueryRaw.mockResolvedValueOnce([
      {
        id: 'rt-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        rotatedAt: null,
        replacedByToken: null,
      },
    ]);
    mockUser.findUnique.mockResolvedValue(baseUser);
    mockRefreshToken.create.mockResolvedValue({ ...baseRefreshToken, token: NEW_REFRESH_TOKEN });
    mockRefreshToken.update.mockResolvedValue(baseRefreshToken);
    mockRefreshToken.deleteMany.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: REFRESH_TOKEN });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    // Old token is marked rotated (kept for the grace window), not deleted.
    expect(mockRefreshToken.update).toHaveBeenCalled();
  });

  it('resolves an already-rotated token to its successor within the grace window', async () => {
    // A concurrent/retried refresh sees the row already rotated; it must converge
    // on the successor instead of failing (this is the fix for tester logouts).
    mockTxQueryRaw.mockResolvedValueOnce([
      {
        id: 'rt-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        rotatedAt: new Date(), // just rotated
        replacedByToken: NEW_REFRESH_TOKEN,
      },
    ]);
    mockUser.findUnique.mockResolvedValue(baseUser);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: REFRESH_TOKEN });

    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).toBe(NEW_REFRESH_TOKEN);
    // No new rotation happened on the grace path.
    expect(mockRefreshToken.create).not.toHaveBeenCalled();
  });

  it('returns 401 when a rotated token is reused after the grace window', async () => {
    mockTxQueryRaw.mockResolvedValueOnce([
      {
        id: 'rt-1',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        rotatedAt: new Date(Date.now() - 5 * 60 * 1000), // rotated 5 min ago
        replacedByToken: NEW_REFRESH_TOKEN,
      },
    ]);
    mockUser.findUnique.mockResolvedValue(baseUser);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: REFRESH_TOKEN });

    expect(res.status).toBe(401);
  });

  it('returns 401 when refresh token is not found', async () => {
    mockTxQueryRaw.mockResolvedValueOnce([]);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: REFRESH_TOKEN });

    expect(res.status).toBe(401);
  });

  it('returns 401 when refresh token is expired', async () => {
    mockTxQueryRaw.mockResolvedValueOnce([
      {
        id: 'rt-1',
        userId: 'user-1',
        expiresAt: new Date('2020-01-01'), // past date
        rotatedAt: null,
        replacedByToken: null,
      },
    ]);
    mockRefreshToken.delete.mockResolvedValue(baseRefreshToken);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: REFRESH_TOKEN });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/expired/i);
  });

  it('returns 400 when refreshToken field is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({});

    expect(res.status).toBe(400);
  });
});

// ── POST /api/v1/auth/logout ──────────────────────────────────────────────────

describe('POST /api/v1/auth/logout', () => {
  it('returns 200 and deletes the refresh token', async () => {
    mockRefreshToken.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: REFRESH_TOKEN });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockRefreshToken.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token: REFRESH_TOKEN } }),
    );
  });

  it('returns 400 when refreshToken is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .send({});

    expect(res.status).toBe(400);
  });
});

// ── GET /api/v1/auth/me ───────────────────────────────────────────────────────

describe('GET /api/v1/auth/me', () => {
  it('returns 200 with user when authenticated', async () => {
    mockUser.findUnique.mockResolvedValue({
      ...baseUser,
      tags: [],
      storeItems: [],
      coinSellerProfile: null,
      payrollAgentProfile: null,
      activeSpecialId: null,
      activeSpecialIdLevel: null,
      activeSpecialIdExpiresAt: null,
      isVerifiedHost: false,
      isPremiumHost: false,
      password: null,
      preferredWithdrawalCountryCode: '',
    });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('user-1');
    // supabaseUid must never be exposed
    expect(res.body.data.supabaseUid).toBeUndefined();
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 when token is malformed', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer bad.token.here');
    expect(res.status).toBe(401);
  });
});

// ── PATCH /api/v1/auth/onboarding ────────────────────────────────────────────

describe('PATCH /api/v1/auth/onboarding', () => {
  const validBody = { username: 'testuser', displayName: 'Test User', country: 'GB' };

  it('returns 200 with updated user on successful onboarding', async () => {
    mockUser.findUnique
      .mockResolvedValueOnce(baseUser)           // find user by id
      .mockResolvedValueOnce(null)               // username uniqueness check
      .mockResolvedValueOnce(null);              // hakaId uniqueness check in generateUniqueHakaId
    mockUser.update.mockResolvedValue({
      ...baseUser,
      username: 'testuser',
      displayName: 'Test User',
      country: 'GB',
      hakaId: 'HAKAABC12345',
      onboardingComplete: true,
    });

    const res = await request(app)
      .patch('/api/v1/auth/onboarding')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.data.onboardingComplete).toBe(true);
    expect(res.body.data.username).toBe('testuser');
  });

  it('returns 400 when onboarding already completed', async () => {
    mockUser.findUnique.mockResolvedValue({ ...baseUser, onboardingComplete: true });

    const res = await request(app)
      .patch('/api/v1/auth/onboarding')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send(validBody);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already completed/i);
  });

  it('returns 409 when username is already taken', async () => {
    mockUser.findUnique
      .mockResolvedValueOnce(baseUser)                // find user by id
      .mockResolvedValueOnce({ id: 'other-user' });   // username already exists

    const res = await request(app)
      .patch('/api/v1/auth/onboarding')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/username/i);
  });

  it('returns 400 on validation error (missing username)', async () => {
    const res = await request(app)
      .patch('/api/v1/auth/onboarding')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ displayName: 'Test', country: 'GB' }); // missing username

    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app)
      .patch('/api/v1/auth/onboarding')
      .send(validBody);

    expect(res.status).toBe(401);
  });
});

// ── PATCH /api/v1/auth/profile ────────────────────────────────────────────────

describe('PATCH /api/v1/auth/profile', () => {
  beforeEach(() => {
    mockUser.findUnique.mockResolvedValue({
      ...baseUser,
      coinSellerProfile: null,
    });
  });

  it('returns 200 with updated profile', async () => {
    mockUser.update.mockResolvedValue({
      ...baseUser,
      bio: 'Hello world',
      displayName: 'New Name',
    });

    const res = await request(app)
      .patch('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ bio: 'Hello world', displayName: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.data.bio).toBe('Hello world');
    expect(res.body.data.displayName).toBe('New Name');
  });

  it('returns 400 when coverImage is not a valid URL', async () => {
    const res = await request(app)
      .patch('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ avatar: 'not-a-url' });

    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app)
      .patch('/api/v1/auth/profile')
      .send({ bio: 'test' });

    expect(res.status).toBe(401);
  });

  it('persists gender in response', async () => {
    mockUser.update.mockResolvedValue({
      ...baseUser,
      gender: 'male',
      coinSellerProfile: null,
      storeItems: [],
    });

    const res = await request(app)
      .patch('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ gender: 'male' });

    expect(res.status).toBe(200);
    expect(res.body.data.gender).toBe('male');
    expect(mockUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ gender: 'male' }),
      }),
    );
  });

  it('rejects country change after Haka ID is created', async () => {
    mockUser.findUnique.mockResolvedValue({
      onboardingComplete: true,
      hakaId: '123456',
      country: 'GB',
      gender: 'male',
    });

    const res = await request(app)
      .patch('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ country: 'US' });

    expect(res.status).toBe(400);
    expect(mockUser.update).not.toHaveBeenCalled();
  });

  it('rejects gender change after Haka ID is created', async () => {
    mockUser.findUnique.mockResolvedValue({
      onboardingComplete: true,
      hakaId: '123456',
      country: 'GB',
      gender: 'male',
    });

    const res = await request(app)
      .patch('/api/v1/auth/profile')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ gender: 'female' });

    expect(res.status).toBe(400);
    expect(mockUser.update).not.toHaveBeenCalled();
  });
});
