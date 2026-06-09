/**
 * Blocklist module tests
 * Tests: GET /blocklist, POST /blocklist, DELETE /blocklist/:userId
 *
 * Prisma is mocked — no real database needed.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../config/firebase', () => ({
  firebaseAdmin: {
    auth: () => ({ verifyIdToken: jest.fn() }),
  },
}));

jest.mock('../../config/prisma', () => ({
  prisma: {
    blockedUser: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    ban: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';
import { prisma } from '../../config/prisma';

const JWT_SECRET = 'test-jwt-access-secret-at-least-16';
const ACTOR_ID = 'user-actor-1';
const TARGET_ID = 'user-target-1';

function makeToken(userId = ACTOR_ID) {
  return jwt.sign({ sub: userId, role: 'normal_user' }, JWT_SECRET, { expiresIn: '15m' });
}

const mockBlockedUser = prisma.blockedUser as unknown as {
  findMany: jest.Mock;
  findUnique: jest.Mock;
  upsert: jest.Mock;
  delete: jest.Mock;
};
const mockUser = prisma.user as unknown as { findUnique: jest.Mock };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/blocklist', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/v1/blocklist');
    expect(res.status).toBe(401);
  });

  it('returns empty list when user has no blocks', async () => {
    mockBlockedUser.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/blocklist')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns blocked users list', async () => {
    mockBlockedUser.findMany.mockResolvedValue([
      {
        id: 'block-1',
        actorId: ACTOR_ID,
        targetId: TARGET_ID,
        createdAt: new Date('2026-01-01'),
        target: { id: TARGET_ID, displayName: 'Bob', avatar: '', hakaId: 'HK001' },
      },
    ]);

    const res = await request(app)
      .get('/api/v1/blocklist')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].blocked_id).toBe(TARGET_ID);
    expect(res.body.data[0].displayName).toBe('Bob');
  });
});

describe('POST /api/v1/blocklist', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/v1/blocklist').send({ user_id: TARGET_ID });
    expect(res.status).toBe(401);
  });

  it('blocks a user successfully', async () => {
    mockUser.findUnique.mockResolvedValue({
      id: TARGET_ID,
      displayName: 'Bob',
      avatar: '',
      hakaId: 'HK001',
    });
    mockBlockedUser.upsert.mockResolvedValue({
      id: 'block-new',
      actorId: ACTOR_ID,
      targetId: TARGET_ID,
      createdAt: new Date(),
    });

    const res = await request(app)
      .post('/api/v1/blocklist')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ user_id: TARGET_ID });

    expect(res.status).toBe(201);
    expect(res.body.data.blocked_id).toBe(TARGET_ID);
    expect(res.body.data.displayName).toBe('Bob');
  });

  it('rejects request missing user_id', async () => {
    const res = await request(app)
      .post('/api/v1/blocklist')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('rejects blocking yourself', async () => {
    const res = await request(app)
      .post('/api/v1/blocklist')
      .set('Authorization', `Bearer ${makeToken(ACTOR_ID)}`)
      .send({ user_id: ACTOR_ID });

    expect(res.status).toBe(400);
  });

  it('returns 400 when target user not found', async () => {
    mockUser.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/blocklist')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ user_id: 'nonexistent-user' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/v1/blocklist/:userId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).delete(`/api/v1/blocklist/${TARGET_ID}`);
    expect(res.status).toBe(401);
  });

  it('unblocks a user successfully', async () => {
    mockBlockedUser.delete.mockResolvedValue({});

    const res = await request(app)
      .delete(`/api/v1/blocklist/${TARGET_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
  });

  it('succeeds even if user was not blocked (idempotent)', async () => {
    mockBlockedUser.delete.mockRejectedValue(new Error('Record not found'));

    const res = await request(app)
      .delete(`/api/v1/blocklist/${TARGET_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    // The service uses .catch(() => undefined), so delete is idempotent
    expect(res.status).toBe(200);
  });
});
