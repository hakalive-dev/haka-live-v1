/**
 * Search module tests
 * Tests: GET /search?q=...&type=...
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
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    room: {
      findMany: jest.fn().mockResolvedValue([]),
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
const USER_ID = 'user-search-1';

function makeToken(userId = USER_ID) {
  return jwt.sign({ sub: userId, role: 'normal_user' }, JWT_SECRET, { expiresIn: '15m' });
}

const mockUser = prisma.user as unknown as { findMany: jest.Mock };
const mockRoom = prisma.room as unknown as { findMany: jest.Mock };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/search', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/v1/search?q=alice');
    expect(res.status).toBe(401);
  });

  it('returns empty results when q is missing', async () => {
    const res = await request(app)
      .get('/api/v1/search')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ users: [], rooms: [] });
  });

  it('returns empty results when q is blank', async () => {
    const res = await request(app)
      .get('/api/v1/search?q=')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ users: [], rooms: [] });
  });

  it('searches users and rooms by default (type=all)', async () => {
    mockUser.findMany.mockResolvedValue([
      {
        id: USER_ID,
        username: 'alice',
        displayName: 'Alice',
        avatar: '',
        hakaId: null,
        activeSpecialId: null,
        activeSpecialIdLevel: null,
        activeSpecialIdExpiresAt: null,
        country: 'US',
        bio: '',
        role: 'normal_user',
        isActive: true,
        createdAt: new Date(),
        level: { richLevel: 1, charmLevel: 1 },
        storeItems: [],
      },
    ]);
    mockRoom.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/search?q=alice')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.users).toHaveLength(1);
    expect(res.body.data.users[0].username).toBe('alice');
    expect(res.body.data.rooms).toHaveLength(0);
    expect(mockUser.findMany).toHaveBeenCalled();
    expect(mockRoom.findMany).toHaveBeenCalled();
  });

  it('only searches users when type=users', async () => {
    mockUser.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/search?q=test&type=users')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(mockUser.findMany).toHaveBeenCalled();
    expect(mockRoom.findMany).not.toHaveBeenCalled();
  });

  it('only searches rooms when type=rooms', async () => {
    mockRoom.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/search?q=test&type=rooms')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(mockUser.findMany).not.toHaveBeenCalled();
    expect(mockRoom.findMany).toHaveBeenCalled();
  });

  it('rejects invalid type value', async () => {
    const res = await request(app)
      .get('/api/v1/search?q=test&type=invalid')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
  });
});
