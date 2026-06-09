/**
 * Moments module tests
 * Tests: GET /, POST /, GET /user/:userId, GET /:id,
 *        DELETE /:id, POST /:id/like, GET /:id/comments,
 *        POST /:id/comments, POST /:id/share, POST /:id/gift
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
    moment: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    momentLike: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    momentComment: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    },
    gift: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    wallet: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    walletTransaction: {
      create: jest.fn().mockResolvedValue({}),
    },
    ban: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    accountRisk: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn(),
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';
import { prisma } from '../../config/prisma';

const JWT_SECRET = 'test-jwt-access-secret-at-least-16';
const USER_ID = 'user-moments-1';
const MOMENT_ID = 'moment-uuid-1';

function makeToken(userId = USER_ID) {
  return jwt.sign({ sub: userId, role: 'normal_user' }, JWT_SECRET, { expiresIn: '15m' });
}

const mockMoment = prisma.moment as unknown as {
  findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock;
  delete: jest.Mock; update: jest.Mock; count: jest.Mock;
};
const mockMomentLike = prisma.momentLike as unknown as {
  findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; delete: jest.Mock;
};
const mockMomentComment = prisma.momentComment as unknown as {
  findMany: jest.Mock; create: jest.Mock;
};
const mockGift = prisma.gift as unknown as { findUnique: jest.Mock };
const mockWallet = prisma.wallet as unknown as { findUnique: jest.Mock };
const mockTransaction = prisma as unknown as { $transaction: jest.Mock };

const fakeMoment = {
  id: MOMENT_ID,
  userId: USER_ID,
  postType: 'moment',
  mediaUrl: 'https://example.com/photo.jpg',
  caption: 'Hello world',
  hashtag: '#haka',
  likesCount: 0,
  commentsCount: 0,
  sharesCount: 0,
  giftsCount: 0,
  createdAt: new Date(),
  user: {
    id: USER_ID,
    username: 'alice',
    displayName: 'Alice',
    avatar: '',
    country: 'US',
    level: { richLevel: 1, charmLevel: 1 },
  },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/moments', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/v1/moments');
    expect(res.status).toBe(401);
  });

  it('returns empty moments list', async () => {
    mockMoment.findMany.mockResolvedValue([]);
    mockMoment.count.mockResolvedValue(0);
    mockMomentLike.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/moments')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.results).toHaveLength(0);
    expect(res.body.data.count).toBe(0);
  });

  it('returns moments list with pagination info', async () => {
    mockMoment.findMany.mockResolvedValue([fakeMoment]);
    mockMoment.count.mockResolvedValue(1);
    mockMomentLike.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/moments')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.results).toHaveLength(1);
    expect(res.body.data.results[0].id).toBe(MOMENT_ID);
    expect(res.body.data.count).toBe(1);
    expect(res.body.data).toHaveProperty('page');
    expect(res.body.data).toHaveProperty('page_size');
  });
});

describe('POST /api/v1/moments', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/v1/moments').send({ caption: 'Test' });
    expect(res.status).toBe(401);
  });

  it('creates a new moment', async () => {
    mockMoment.create.mockResolvedValue(fakeMoment);

    const res = await request(app)
      .post('/api/v1/moments')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ post_type: 'moment', caption: 'Hello world', hashtag: '#haka' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(MOMENT_ID);
    expect(res.body.data.caption).toBe('Hello world');
  });
});

describe('GET /api/v1/moments/user/:userId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).get(`/api/v1/moments/user/${USER_ID}`);
    expect(res.status).toBe(401);
  });

  it('returns moments for a specific user', async () => {
    mockMoment.findMany.mockResolvedValue([fakeMoment]);
    mockMoment.count.mockResolvedValue(1);
    mockMomentLike.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get(`/api/v1/moments/user/${USER_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.results).toHaveLength(1);
  });
});

describe('GET /api/v1/moments/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).get(`/api/v1/moments/${MOMENT_ID}`);
    expect(res.status).toBe(401);
  });

  it('returns a single moment', async () => {
    mockMoment.findUnique.mockResolvedValue(fakeMoment);
    mockMomentLike.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/moments/${MOMENT_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(MOMENT_ID);
  });

  it('returns 404 for nonexistent moment', async () => {
    mockMoment.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/moments/nonexistent-id`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/moments/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).delete(`/api/v1/moments/${MOMENT_ID}`);
    expect(res.status).toBe(401);
  });

  it('deletes own moment', async () => {
    mockMoment.findUnique.mockResolvedValue(fakeMoment);
    mockMoment.delete.mockResolvedValue(fakeMoment);

    const res = await request(app)
      .delete(`/api/v1/moments/${MOMENT_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
  });

  it('returns 404 when moment does not belong to user', async () => {
    mockMoment.findUnique.mockResolvedValue({ ...fakeMoment, userId: 'other-user' });

    const res = await request(app)
      .delete(`/api/v1/moments/${MOMENT_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/moments/:id/like', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).post(`/api/v1/moments/${MOMENT_ID}/like`);
    expect(res.status).toBe(401);
  });

  it('likes a moment (was not liked)', async () => {
    mockMomentLike.findUnique.mockResolvedValue(null);
    mockMomentLike.create.mockResolvedValue({});
    mockMoment.update.mockResolvedValue({ ...fakeMoment, likesCount: 1 });

    const res = await request(app)
      .post(`/api/v1/moments/${MOMENT_ID}/like`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.liked).toBe(true);
    expect(res.body.data.likes_count).toBe(1);
  });

  it('unlikes a moment (was liked)', async () => {
    mockMomentLike.findUnique.mockResolvedValue({ momentId: MOMENT_ID, userId: USER_ID });
    mockMomentLike.delete.mockResolvedValue({});
    mockMoment.update.mockResolvedValue({ ...fakeMoment, likesCount: 0 });

    const res = await request(app)
      .post(`/api/v1/moments/${MOMENT_ID}/like`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.liked).toBe(false);
  });
});

describe('GET /api/v1/moments/:id/comments', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).get(`/api/v1/moments/${MOMENT_ID}/comments`);
    expect(res.status).toBe(401);
  });

  it('returns comments for a moment', async () => {
    mockMomentComment.findMany.mockResolvedValue([
      {
        id: 'comment-1',
        momentId: MOMENT_ID,
        userId: USER_ID,
        text: 'Great post!',
        likesCount: 0,
        createdAt: new Date(),
        user: fakeMoment.user,
      },
    ]);

    const res = await request(app)
      .get(`/api/v1/moments/${MOMENT_ID}/comments`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].text).toBe('Great post!');
  });
});

describe('POST /api/v1/moments/:id/comments', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .post(`/api/v1/moments/${MOMENT_ID}/comments`)
      .send({ text: 'Nice!' });
    expect(res.status).toBe(401);
  });

  it('posts a comment', async () => {
    mockMomentComment.create.mockResolvedValue({
      id: 'comment-new',
      text: 'Nice!',
      likesCount: 0,
      createdAt: new Date(),
      user: fakeMoment.user,
    });
    mockMoment.update.mockResolvedValue({ ...fakeMoment, commentsCount: 1 });

    const res = await request(app)
      .post(`/api/v1/moments/${MOMENT_ID}/comments`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ text: 'Nice!' });

    expect(res.status).toBe(201);
    expect(res.body.data.text).toBe('Nice!');
  });

  it('rejects empty comment text', async () => {
    const res = await request(app)
      .post(`/api/v1/moments/${MOMENT_ID}/comments`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ text: '' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/moments/:id/share', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).post(`/api/v1/moments/${MOMENT_ID}/share`);
    expect(res.status).toBe(401);
  });

  it('increments share count', async () => {
    mockMoment.update.mockResolvedValue({ ...fakeMoment, sharesCount: 1 });

    const res = await request(app)
      .post(`/api/v1/moments/${MOMENT_ID}/share`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.shares_count).toBe(1);
  });
});

describe('POST /api/v1/moments/:id/gift', () => {
  const fakeTx = {
    wallet: { update: jest.fn().mockResolvedValue({}) },
    walletTransaction: { create: jest.fn().mockResolvedValue({}) },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransaction.$transaction.mockImplementation((fn: any) =>
      typeof fn === 'function' ? fn(fakeTx) : Promise.all(fn),
    );
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).post(`/api/v1/moments/${MOMENT_ID}/gift`).send({ gift_id: 'g1' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when gift_id is missing', async () => {
    const res = await request(app)
      .post(`/api/v1/moments/${MOMENT_ID}/gift`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns error when gift not found', async () => {
    mockGift.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/moments/${MOMENT_ID}/gift`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ gift_id: 'nonexistent' });

    expect(res.status).toBe(500);
  });

  it('returns error when insufficient coins', async () => {
    mockGift.findUnique.mockResolvedValue({ id: 'gift-1', name: 'Rose', coinCost: 100 });
    mockWallet.findUnique.mockResolvedValue({ id: 'wallet-1', coinBalance: 50 });

    const res = await request(app)
      .post(`/api/v1/moments/${MOMENT_ID}/gift`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ gift_id: 'gift-1' });

    expect(res.status).toBe(500);
  });

  it('sends a gift successfully', async () => {
    mockGift.findUnique.mockResolvedValue({ id: 'gift-1', name: 'Rose', coinCost: 50 });
    mockWallet.findUnique.mockResolvedValue({ id: 'wallet-1', coinBalance: 200 });
    mockMoment.update.mockResolvedValue({ ...fakeMoment, giftsCount: 1 });

    const res = await request(app)
      .post(`/api/v1/moments/${MOMENT_ID}/gift`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ gift_id: 'gift-1' });

    expect(res.status).toBe(200);
    expect(res.body.data.gift_name).toBe('Rose');
    expect(res.body.data.coin_cost).toBe(50);
  });
});
