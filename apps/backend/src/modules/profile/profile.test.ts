/**
 * Profile module tests
 * Tests: PATCH /profile/me, POST /profile/location, POST /profile/avatar
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
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    ban: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    userSettings: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

jest.mock('../../config/supabase', () => ({
  supabase: {
    storage: {
      from: jest.fn(() => ({
        createSignedUploadUrl: jest.fn().mockResolvedValue({
          data: {
            signedUrl: 'https://example.com/upload',
            token: 'upload-token-123',
          },
          error: null,
        }),
        getPublicUrl: jest.fn(() => ({
          data: { publicUrl: 'https://example.com/avatars/u/user-1/123.jpg' },
        })),
      })),
    },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';
import { prisma } from '../../config/prisma';

const JWT_SECRET = 'test-jwt-access-secret-at-least-16';
const USER_ID = 'user-profile-1';

function makeToken(userId = USER_ID) {
  return jwt.sign({ sub: userId, role: 'normal_user' }, JWT_SECRET, { expiresIn: '15m' });
}

const mockUser = prisma.user as unknown as { update: jest.Mock; findUnique: jest.Mock };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PATCH /api/v1/profile/me', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).patch('/api/v1/profile/me').send({ displayName: 'Alice' });
    expect(res.status).toBe(401);
  });

  it('updates profile and returns updated user', async () => {
    // updateProfile first loads the user to check the onboarding/hakaId lock
    mockUser.findUnique.mockResolvedValue({
      onboardingComplete: false,
      hakaId: null,
      country: '',
      gender: '',
    });
    mockUser.update.mockResolvedValue({
      id: USER_ID,
      displayName: 'Alice Updated',
      username: 'alice',
      email: 'alice@example.com',
      avatar: '',
      bio: 'Hello',
      role: 'normal_user',
      isActive: true,
      hakaId: null,
      coinSellerProfile: null,
    });

    const res = await request(app)
      .patch('/api/v1/profile/me')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ displayName: 'Alice Updated', bio: 'Hello' });

    expect(res.status).toBe(200);
    expect(res.body.data.displayName).toBe('Alice Updated');
    expect(mockUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: expect.objectContaining({ displayName: 'Alice Updated', bio: 'Hello' }),
      }),
    );
  });

  it('rejects empty displayName', async () => {
    const res = await request(app)
      .patch('/api/v1/profile/me')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ displayName: '' });
    expect(res.status).toBe(400);
  });

  it('rejects bio over 200 chars', async () => {
    const res = await request(app)
      .patch('/api/v1/profile/me')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ bio: 'x'.repeat(201) });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/profile/location', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/v1/profile/location').send({ lat: 1, lng: 1 });
    expect(res.status).toBe(401);
  });

  it('updates location with valid lat/lng', async () => {
    mockUser.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/profile/location')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ lat: 40.7128, lng: -74.006 });

    expect(res.status).toBe(200);
    expect(mockUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: expect.objectContaining({ locationLat: 40.7128, locationLng: -74.006 }),
      }),
    );
  });

  it('rejects lat out of range', async () => {
    const res = await request(app)
      .post('/api/v1/profile/location')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ lat: 91, lng: 0 });
    expect(res.status).toBe(400);
  });

  it('rejects missing lat', async () => {
    const res = await request(app)
      .post('/api/v1/profile/location')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ lng: 10 });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/profile/avatar', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/v1/profile/avatar');
    expect(res.status).toBe(401);
  });

  it('returns signed upload URL and public URL', async () => {
    const res = await request(app)
      .post('/api/v1/profile/avatar')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ext: 'png' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('uploadUrl');
    expect(res.body.data).toHaveProperty('publicUrl');
    expect(res.body.data).toHaveProperty('token');
  });

  it('uses jpg as default extension', async () => {
    const res = await request(app)
      .post('/api/v1/profile/avatar')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.path).toMatch(/\.jpg$/);
  });

  it('rejects unsupported extension', async () => {
    const res = await request(app)
      .post('/api/v1/profile/avatar')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ext: 'gif' });

    expect(res.status).toBe(400);
  });
});
