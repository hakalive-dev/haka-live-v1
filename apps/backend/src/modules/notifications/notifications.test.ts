/**
 * Notifications module tests
 * Tests: GET /notifications, GET /notifications/count,
 *        PATCH /notifications/:id/read, PATCH /notifications/read-all,
 *        POST /notifications/fcm-token
 *
 * Prisma is mocked — no real database needed.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../config/firebase', () => ({
  firebaseAdmin: {
    auth: () => ({ verifyIdToken: jest.fn() }),
    messaging: () => ({ send: jest.fn().mockResolvedValue('message-id') }),
  },
}));

jest.mock('../../config/prisma', () => ({
  prisma: {
    notification: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
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
const USER_ID = 'user-notify-1';
const NOTIF_ID = 'notif-uuid-1';

function makeToken(userId = USER_ID) {
  return jwt.sign({ sub: userId, role: 'normal_user' }, JWT_SECRET, { expiresIn: '15m' });
}

const mockNotification = prisma.notification as unknown as {
  findMany: jest.Mock;
  count: jest.Mock;
  findUnique: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
};
const mockUser = prisma.user as unknown as { findUnique: jest.Mock; update: jest.Mock };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/notifications', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });

  it('returns empty notifications list', async () => {
    mockNotification.findMany.mockResolvedValue([]);
    mockNotification.count.mockResolvedValue(0);

    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
    expect(res.body.data.total).toBe(0);
    expect(res.body.data.hasMore).toBe(false);
  });

  it('returns paginated notifications', async () => {
    const fakeNotif = {
      id: NOTIF_ID,
      userId: USER_ID,
      type: 'gift',
      title: 'You received a gift!',
      body: 'Alice sent you a gift.',
      imageUrl: '',
      isRead: false,
      createdAt: new Date(),
    };
    mockNotification.findMany.mockResolvedValue([fakeNotif]);
    mockNotification.count.mockResolvedValue(1);

    const res = await request(app)
      .get('/api/v1/notifications?page=1&limit=10')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].id).toBe(NOTIF_ID);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.limit).toBe(10);
  });
});

describe('GET /api/v1/notifications/count', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/v1/notifications/count');
    expect(res.status).toBe(401);
  });

  it('returns unread notification count', async () => {
    mockNotification.count.mockResolvedValue(5);

    const res = await request(app)
      .get('/api/v1/notifications/count')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(5);
  });

  it('returns 0 when no unread notifications', async () => {
    mockNotification.count.mockResolvedValue(0);

    const res = await request(app)
      .get('/api/v1/notifications/count')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(0);
  });
});

describe('PATCH /api/v1/notifications/:id/read', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).patch(`/api/v1/notifications/${NOTIF_ID}/read`);
    expect(res.status).toBe(401);
  });

  it('marks notification as read', async () => {
    mockNotification.findUnique.mockResolvedValue({
      id: NOTIF_ID,
      userId: USER_ID,
      isRead: false,
    });
    mockNotification.update.mockResolvedValue({
      id: NOTIF_ID,
      userId: USER_ID,
      isRead: true,
    });

    const res = await request(app)
      .patch(`/api/v1/notifications/${NOTIF_ID}/read`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(mockNotification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: NOTIF_ID },
        data: { isRead: true },
      }),
    );
  });

  it('returns 404 for non-existent notification', async () => {
    mockNotification.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/v1/notifications/nonexistent/read`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });

  it('returns 403 when notification belongs to another user', async () => {
    mockNotification.findUnique.mockResolvedValue({
      id: NOTIF_ID,
      userId: 'other-user',
      isRead: false,
    });

    const res = await request(app)
      .patch(`/api/v1/notifications/${NOTIF_ID}/read`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/v1/notifications/read-all', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).patch('/api/v1/notifications/read-all');
    expect(res.status).toBe(401);
  });

  it('marks all notifications as read', async () => {
    mockNotification.updateMany.mockResolvedValue({ count: 7 });

    const res = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(7);
  });
});

describe('POST /api/v1/notifications/fcm-token', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/fcm-token')
      .send({ token: 'fcm-token-abc' });
    expect(res.status).toBe(401);
  });

  it('updates FCM token', async () => {
    mockUser.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/notifications/fcm-token')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ token: 'fcm-token-abc123' });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(true);
    expect(mockUser.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: { fcmToken: 'fcm-token-abc123' },
      }),
    );
  });

  it('rejects empty token', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/fcm-token')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ token: '' });

    expect(res.status).toBe(400);
  });

  it('rejects missing token field', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/fcm-token')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});

    expect(res.status).toBe(400);
  });
});
