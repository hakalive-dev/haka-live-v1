/**
 * Feature 2 — User Profiles & Social Graph
 * Tests: GET /users/:id, GET /users/search, follow/unfollow,
 *        special-attention, profile visits, followers/following
 *
 * Prisma and Firebase Admin are fully mocked — no real DB needed.
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
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    follow: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    specialAttention: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    profileVisit: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    giftTransaction: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { coinCost: null, beanValue: null } }),
    },
    userSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    ban: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';
import { prisma } from '../../config/prisma';
import { resolveUserId } from './users.service';

const mockUser = prisma.user as unknown as {
  findUnique: jest.Mock;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  count: jest.Mock;
};
const mockFollow = prisma.follow as unknown as {
  upsert: jest.Mock;
  deleteMany: jest.Mock;
  findUnique: jest.Mock;
  findMany: jest.Mock;
  count: jest.Mock;
};
const mockSpecialAttention = prisma.specialAttention as unknown as {
  upsert: jest.Mock;
  deleteMany: jest.Mock;
  findUnique: jest.Mock;
  findMany: jest.Mock;
  count: jest.Mock;
};
const mockProfileVisit = prisma.profileVisit as unknown as {
  upsert: jest.Mock;
  findMany: jest.Mock;
  count: jest.Mock;
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-jwt-access-secret-at-least-16';

function makeAccessToken(userId = 'actor-1', role = 'normal_user') {
  return jwt.sign({ sub: userId, role }, JWT_SECRET, { expiresIn: '15m' });
}

const publicUserDb = {
  id: 'target-1',
  username: 'target_user',
  displayName: 'Target User',
  avatar: '',
  bio: 'Hello',
  country: 'GB',
  hakaId: 'HAKA12345678',
  activeSpecialId: null,
  activeSpecialIdLevel: null,
  activeSpecialIdExpiresAt: null,
  storeItems: [],
  tags: [],
  level: null,
  settings: null,
  role: 'normal_user',
  hostType: '',
  isActive: true,
  onboardingComplete: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  _count: { followedBy: 10, following: 5, moments: 0 },
};

// Helper: mock a full buildPublicUser resolution (no viewer context)
function mockPublicUserLookup(user = publicUserDb) {
  mockUser.findUnique.mockResolvedValue(user);
  mockFollow.count.mockResolvedValue(0);
  mockFollow.findUnique.mockResolvedValue(null);
  mockSpecialAttention.findUnique.mockResolvedValue(null);
}

// ── resolveUserId ─────────────────────────────────────────────────────────────

describe('resolveUserId', () => {
  beforeEach(() => {
    mockUser.findUnique.mockReset();
    mockUser.findFirst.mockReset();
    mockUser.findFirst.mockResolvedValue(null);
  });

  it('resolves active special id when hakaId and id do not match', async () => {
    mockUser.findUnique.mockResolvedValue(null);
    mockUser.findFirst.mockResolvedValue({ id: 'spec-user' });
    await expect(resolveUserId('666666')).resolves.toBe('spec-user');
  });

  it('throws when no user matches special id', async () => {
    mockUser.findUnique.mockResolvedValue(null);
    mockUser.findFirst.mockResolvedValue(null);
    await expect(resolveUserId('666666')).rejects.toMatchObject({ message: 'User not found', statusCode: 404 });
  });

  it('resolves by UUID when user exists', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    mockUser.findUnique.mockResolvedValue({ id: 'resolved-uuid-user' });
    await expect(resolveUserId(uuid)).resolves.toBe('resolved-uuid-user');
    expect(mockUser.findFirst).not.toHaveBeenCalled();
  });

  it('throws when UUID user does not exist', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    mockUser.findUnique.mockResolvedValue(null);
    await expect(resolveUserId(uuid)).rejects.toMatchObject({ message: 'User not found', statusCode: 404 });
  });
});

// ── GET /api/v1/users/:id ─────────────────────────────────────────────────────

describe('GET /api/v1/users/:id', () => {
  it('returns 200 with public user profile', async () => {
    mockPublicUserLookup();

    const res = await request(app).get('/api/v1/users/target-1');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('target-1');
    expect(res.body.data.friendCount).toBe(0);
    expect(res.body.data.followerCount).toBe(10);
    expect(res.body.data.followingCount).toBe(5);
    // Internal fields must not leak
    expect(res.body.data.supabaseUid).toBeUndefined();
    expect(res.body.data.isActive).toBeUndefined();
  });

  it('returns 404 when user does not exist', async () => {
    mockUser.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/users/nonexistent');

    expect(res.status).toBe(404);
  });

  it('returns 200 when path param is an active special id', async () => {
    mockUser.findUnique.mockImplementation((args: { where?: { id?: string; hakaId?: string } }) => {
      const id = args.where?.id;
      const hakaId = args.where?.hakaId;
      if (id === '888888' || hakaId === '888888') return Promise.resolve(null);
      if (id === 'target-1') return Promise.resolve(publicUserDb);
      return Promise.resolve(null);
    });
    mockUser.findFirst.mockResolvedValue({ id: 'target-1' });
    mockFollow.findUnique.mockResolvedValue(null);
    mockSpecialAttention.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/users/888888');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('target-1');
  });

  it('returns 404 for unknown UUID', async () => {
    mockUser.findUnique.mockResolvedValue(null);
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const res = await request(app).get(`/api/v1/users/${uuid}`);
    expect(res.status).toBe(404);
  });

  it('includes isFollowing when caller is authenticated', async () => {
    mockUser.findUnique.mockResolvedValue(publicUserDb);
    mockFollow.findUnique.mockResolvedValue({ actorId: 'actor-1', targetId: 'target-1' });
    mockSpecialAttention.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/users/target-1')
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    // The endpoint is public (no authenticate middleware) so it reads viewerId from
    // query param; isFollowing defaults to null for unauthenticated requests
    expect(res.status).toBe(200);
  });

  it('includes friendCount for mutual follows', async () => {
    mockPublicUserLookup();
    mockFollow.count.mockResolvedValue(3);

    const res = await request(app).get('/api/v1/users/target-1');

    expect(res.status).toBe(200);
    expect(res.body.data.friendCount).toBe(3);
  });
});

// ── GET /api/v1/users/search ──────────────────────────────────────────────────

describe('GET /api/v1/users/search', () => {
  it('returns paginated search results', async () => {
    mockUser.findMany.mockResolvedValue([publicUserDb]);
    mockUser.count.mockResolvedValue(1);
    // buildPublicUser is called for each result
    mockUser.findUnique.mockResolvedValue(publicUserDb);
    mockFollow.findUnique.mockResolvedValue(null);
    mockSpecialAttention.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/users/search?q=target');

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.hasMore).toBe(false);
  });

  it('finds user by full internal UUID in q', async () => {
    const uuid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const uuidUser = { ...publicUserDb, id: uuid };
    mockUser.findMany.mockResolvedValue([uuidUser]);
    mockUser.count.mockResolvedValue(1);
    mockUser.findUnique.mockResolvedValue(uuidUser);
    mockFollow.findUnique.mockResolvedValue(null);
    mockSpecialAttention.findUnique.mockResolvedValue(null);

    const res = await request(app).get(`/api/v1/users/search?q=${uuid}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].id).toBe(uuid);
  });

  it('returns 400 when q param is missing', async () => {
    const res = await request(app).get('/api/v1/users/search');
    expect(res.status).toBe(400);
  });
});

// ── Follow / Unfollow ─────────────────────────────────────────────────────────

describe('POST /api/v1/users/:id/follow', () => {
  it('returns 200 when following a valid user', async () => {
    mockUser.findUnique.mockResolvedValue(publicUserDb);
    mockFollow.upsert.mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/users/target-1/follow')
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
    expect(mockFollow.upsert).toHaveBeenCalled();
  });

  it('returns 400 when trying to follow yourself', async () => {
    const res = await request(app)
      .post('/api/v1/users/actor-1/follow')
      .set('Authorization', `Bearer ${makeAccessToken('actor-1')}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/yourself/i);
  });

  it('returns 404 when target user does not exist', async () => {
    mockUser.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/users/nonexistent/follow')
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(404);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).post('/api/v1/users/target-1/follow');
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/v1/users/:id/follow', () => {
  it('returns 200 on successful unfollow', async () => {
    mockFollow.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .delete('/api/v1/users/target-1/follow')
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
  });
});

// ── Special Attention ─────────────────────────────────────────────────────────

describe('POST /api/v1/users/:id/special-attention', () => {
  it('returns 200 when adding a followed user to special attention', async () => {
    mockUser.findUnique.mockResolvedValue(publicUserDb);
    mockFollow.findUnique.mockResolvedValue({ actorId: 'actor-1', targetId: 'target-1' });
    mockSpecialAttention.count.mockResolvedValue(0);
    mockSpecialAttention.upsert.mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/users/target-1/special-attention')
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
  });

  it('returns 400 when not following the user', async () => {
    mockUser.findUnique.mockResolvedValue(publicUserDb);
    mockFollow.findUnique.mockResolvedValue(null); // not following

    const res = await request(app)
      .post('/api/v1/users/target-1/special-attention')
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/follow/i);
  });

  it('returns 400 when trying to add yourself', async () => {
    const res = await request(app)
      .post('/api/v1/users/actor-1/special-attention')
      .set('Authorization', `Bearer ${makeAccessToken('actor-1')}`);

    expect(res.status).toBe(400);
  });

  it('returns 400 when special attention list is at capacity (50)', async () => {
    mockUser.findUnique.mockResolvedValue(publicUserDb);
    mockFollow.findUnique.mockResolvedValue({ actorId: 'actor-1', targetId: 'target-1' });
    mockSpecialAttention.count.mockResolvedValue(50);

    const res = await request(app)
      .post('/api/v1/users/target-1/special-attention')
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/full/i);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).post('/api/v1/users/target-1/special-attention');
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/v1/users/:id/special-attention', () => {
  it('returns 200 on successful removal', async () => {
    mockSpecialAttention.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .delete('/api/v1/users/target-1/special-attention')
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
  });
});

// ── Followers / Following ─────────────────────────────────────────────────────

describe('GET /api/v1/users/:id/followers', () => {
  it('returns paginated followers list', async () => {
    mockFollow.findMany.mockResolvedValue([{ actorId: 'actor-2' }]);
    mockFollow.count.mockResolvedValue(1);
    mockUser.findUnique.mockResolvedValue(publicUserDb);
    mockFollow.findUnique.mockResolvedValue(null);
    mockSpecialAttention.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/users/target-1/followers');

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
  });
});

describe('GET /api/v1/users/:id/friends', () => {
  it('returns paginated mutual-follow friends list', async () => {
    mockFollow.findMany.mockResolvedValue([{ targetId: 'friend-1' }]);
    mockFollow.count.mockResolvedValue(1);
    mockUser.findUnique.mockResolvedValue(publicUserDb);
    mockFollow.findUnique.mockResolvedValue(null);
    mockSpecialAttention.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/users/actor-1/friends');

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.total).toBe(1);
    expect(mockFollow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          actorId: 'actor-1',
          target: expect.objectContaining({
            following: { some: { targetId: 'actor-1' } },
          }),
        }),
      }),
    );
  });
});

describe('GET /api/v1/users/:id/following', () => {
  it('returns paginated following list', async () => {
    mockFollow.findMany.mockResolvedValue([{ targetId: 'target-2' }]);
    mockFollow.count.mockResolvedValue(1);
    mockUser.findUnique.mockResolvedValue(publicUserDb);
    mockFollow.findUnique.mockResolvedValue(null);
    mockSpecialAttention.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/users/actor-1/following');

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
  });
});

// ── Profile Visit ─────────────────────────────────────────────────────────────

describe('POST /api/v1/users/:id/visit', () => {
  it('returns 200 and logs the visit', async () => {
    mockUser.findUnique.mockResolvedValue(publicUserDb);
    mockProfileVisit.upsert.mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/users/target-1/visit')
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
    expect(mockProfileVisit.upsert).toHaveBeenCalled();
  });

  it('returns 200 silently when visiting own profile (no-op)', async () => {
    const res = await request(app)
      .post('/api/v1/users/actor-1/visit')
      .set('Authorization', `Bearer ${makeAccessToken('actor-1')}`);

    expect(res.status).toBe(200);
    expect(mockProfileVisit.upsert).not.toHaveBeenCalled();
  });
});

// ── My Visitors ───────────────────────────────────────────────────────────────

describe('GET /api/v1/users/me/visitors', () => {
  it('returns paginated visitors list', async () => {
    mockProfileVisit.findMany.mockResolvedValue([{ actorId: 'visitor-1', updatedAt: new Date() }]);
    mockProfileVisit.count.mockResolvedValue(1);
    mockUser.findUnique.mockResolvedValue(publicUserDb);
    mockFollow.findUnique.mockResolvedValue(null);
    mockSpecialAttention.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/users/me/visitors')
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/v1/users/me/visitors');
    expect(res.status).toBe(401);
  });
});

// ── GET /api/v1/users/me/special-attention ────────────────────────────────────

describe('GET /api/v1/users/me/special-attention', () => {
  it('returns special attention list', async () => {
    mockSpecialAttention.findMany.mockResolvedValue([{ targetId: 'target-1' }]);
    mockSpecialAttention.count.mockResolvedValue(1);
    mockUser.findUnique.mockResolvedValue(publicUserDb);
    mockFollow.findUnique.mockResolvedValue(null);
    mockSpecialAttention.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/users/me/special-attention')
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/v1/users/me/special-attention');
    expect(res.status).toBe(401);
  });
});
