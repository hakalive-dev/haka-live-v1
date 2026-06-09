/**
 * Feature 9 — Level System (HTTP)
 *
 * Ensures `/api/v1/levels/user/:userId` returns a clean 404 when the
 * referenced user does not exist (instead of a Prisma FK P2003).
 */

jest.mock('../../middleware/auth.middleware', () => ({
  authenticate: (_req: any, _res: any, next: any) => next(),
  optionalAuth: (_req: any, _res: any, next: any) => next(),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../config/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    userLevel: {
      upsert: jest.fn(),
    },
  },
}));

import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/prisma';

const mockUser = prisma.user as unknown as {
  findUnique: jest.Mock;
};

const mockUserLevel = prisma.userLevel as unknown as {
  upsert: jest.Mock;
};

describe('GET /api/v1/levels/user/:userId', () => {
  beforeEach(() => {
    mockUser.findUnique.mockReset();
    mockUserLevel.upsert.mockReset();
  });

  it('returns 404 when user does not exist (no FK error)', async () => {
    mockUser.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/levels/user/nonexistent-user-id')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('User not found');
    expect(mockUserLevel.upsert).not.toHaveBeenCalled();
  });

  it('returns level info when user exists', async () => {
    mockUser.findUnique.mockResolvedValue({ id: 'user-1' });
    mockUserLevel.upsert.mockResolvedValue({
      userId: 'user-1',
      richLevel: 1,
      richXp: 0,
      charmLevel: 1,
      charmXp: 0,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const res = await request(app)
      .get('/api/v1/levels/user/user-1')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      richLevel: 1,
      richXp: 0,
      charmLevel: 1,
      charmXp: 0,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(mockUserLevel.upsert).toHaveBeenCalledTimes(1);
  });
});

