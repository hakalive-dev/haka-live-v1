/**
 * Feature 6 — Real-time Chat (DM REST API)
 * Tests: conversations list, message history, send DM, mark as read, online friends
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
    directMessage: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    directMessageHidden: {
      upsert: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    follow: {
      findMany: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    blockedUser: { findFirst: jest.fn().mockResolvedValue(null) },
    userSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    ban: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    accountRisk: { findFirst: jest.fn().mockResolvedValue(null) },
    withdrawalRequest: { count: jest.fn().mockResolvedValue(0) },
    $queryRaw: jest.fn(),
    notification: {
      count: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

// Mock getIO to prevent "Socket.io not initialized" errors
jest.mock('../../sockets', () => ({
  getIO: jest.fn(() => ({
    to: jest.fn(() => ({
      emit: jest.fn(),
    })),
    sockets: {
      adapter: {
        rooms: new Map(),
      },
    },
  })),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';
import { prisma } from '../../config/prisma';
import { getIO } from '../../sockets';

const mockDM = prisma.directMessage as unknown as {
  create: jest.Mock;
  findMany: jest.Mock;
  findFirst: jest.Mock;
  findUnique: jest.Mock;
  count: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
};
const mockDMHidden = prisma.directMessageHidden as unknown as {
  upsert: jest.Mock;
};
const mockUser = prisma.user as unknown as {
  findUnique: jest.Mock;
  findMany: jest.Mock;
};
const mockFollow = prisma.follow as unknown as {
  findMany: jest.Mock;
};
const mockQueryRaw = prisma.$queryRaw as unknown as jest.Mock;
const mockNotification = prisma.notification as unknown as {
  count: jest.Mock;
  updateMany: jest.Mock;
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-jwt-access-secret-at-least-16';
const USER_A = 'user-a-uuid';
const USER_B = 'user-b-uuid';
// Must be a real UUID: forwardDMSchema validates recipientId with z.string().uuid()
const USER_C = '00000000-0000-4000-8000-00000000000c';

function makeToken(userId = USER_A) {
  return jwt.sign({ sub: userId, role: 'normal_user' }, JWT_SECRET, { expiresIn: '15m' });
}

const senderProfile = { id: USER_A, username: 'alice', displayName: 'Alice', avatar: '', hakaId: 'HK111', activeSpecialId: null, activeSpecialIdLevel: null, activeSpecialIdExpiresAt: null, storeItems: [] };
const recipientProfile = { id: USER_B, username: 'bob', displayName: 'Bob', avatar: '', hakaId: 'HK222', activeSpecialId: null, activeSpecialIdLevel: null, activeSpecialIdExpiresAt: null, storeItems: [] };

function baseDmFields(overrides: Record<string, unknown> = {}) {
  return {
    messageType: 'text',
    mediaUrl: null,
    giftId: null,
    giftName: '',
    giftImage: '',
    giftIcon: '',
    giftQty: 0,
    giftCoinCost: 0,
    deletedForAllAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Send DM ───────────────────────────────────────────────────────────────────

describe('POST /api/v1/chat/conversations/:userId/messages', () => {
  it('sends a DM and returns 201', async () => {
    mockUser.findUnique.mockResolvedValue(recipientProfile);
    mockDM.create.mockResolvedValue({
      id: 'dm-1',
      content: 'Hello Bob!',
      isRead: false,
      createdAt: '2026-04-07T10:00:00Z',
      sender: senderProfile,
      recipient: recipientProfile,
      ...baseDmFields(),
    });

    const res = await request(app)
      .post(`/api/v1/chat/conversations/${USER_B}/messages`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ content: 'Hello Bob!' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.content).toBe('Hello Bob!');
    expect(res.body.data.sender.id).toBe(USER_A);
    expect(res.body.data.recipient.id).toBe(USER_B);
  });

  it('rejects empty content', async () => {
    const res = await request(app)
      .post(`/api/v1/chat/conversations/${USER_B}/messages`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ content: '' });

    expect(res.status).toBe(400);
  });

  it('rejects content over 2000 chars', async () => {
    const res = await request(app)
      .post(`/api/v1/chat/conversations/${USER_B}/messages`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ content: 'x'.repeat(2001) });

    expect(res.status).toBe(400);
  });

  it('returns 404 when recipient not found', async () => {
    mockUser.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/chat/conversations/${USER_B}/messages`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ content: 'Hello!' });

    expect(res.status).toBe(404);
    expect(res.body.message).toContain('Recipient not found');
  });

  it('rejects sending DM to yourself', async () => {
    const res = await request(app)
      .post(`/api/v1/chat/conversations/${USER_A}/messages`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ content: 'Talking to myself' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('yourself');
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post(`/api/v1/chat/conversations/${USER_B}/messages`)
      .send({ content: 'Hello!' });

    expect(res.status).toBe(401);
  });
});

// ── Get Messages ──────────────────────────────────────────────────────────────

describe('GET /api/v1/chat/conversations/:userId/messages', () => {
  it('returns paginated messages', async () => {
    const messages = [
      { id: 'dm-1', content: 'Hi', isRead: true, createdAt: '2026-04-07T10:00:00Z', sender: senderProfile, recipient: recipientProfile, ...baseDmFields() },
      { id: 'dm-2', content: 'Hey!', isRead: false, createdAt: '2026-04-07T10:01:00Z', sender: recipientProfile, recipient: senderProfile, ...baseDmFields() },
    ];
    mockDM.findMany.mockResolvedValue(messages);
    mockDM.count.mockResolvedValue(2);

    const res = await request(app)
      .get(`/api/v1/chat/conversations/${USER_B}/messages`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.hasMore).toBe(false);
  });

  it('supports pagination params', async () => {
    mockDM.findMany.mockResolvedValue([]);
    mockDM.count.mockResolvedValue(0);

    const res = await request(app)
      .get(`/api/v1/chat/conversations/${USER_B}/messages?page=2&limit=10`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.page).toBe(2);
    expect(res.body.data.limit).toBe(10);
  });
});

// ── Get Conversations ─────────────────────────────────────────────────────────

describe('GET /api/v1/chat/conversations', () => {
  it('returns empty array when no conversations', async () => {
    mockQueryRaw.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/chat/conversations')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns conversations with last message and unread count', async () => {
    mockQueryRaw.mockResolvedValue([
      { otherId: USER_B, lastMessageId: 'dm-1', unreadCount: BigInt(2) },
    ]);
    mockUser.findMany.mockResolvedValue([
      { ...recipientProfile, settings: { invisibleOnline: false } },
    ]);
    mockFollow.findMany.mockResolvedValue([]);
    mockDM.findMany.mockResolvedValue([
      {
        id: 'dm-1',
        content: 'Latest message',
        isRead: false,
        createdAt: '2026-04-07T10:00:00Z',
        sender: recipientProfile,
        recipient: senderProfile,
        ...baseDmFields(),
      },
    ]);

    const res = await request(app)
      .get('/api/v1/chat/conversations')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].otherUser.id).toBe(USER_B);
    expect(res.body.data[0].lastMessage.content).toBe('Latest message');
    expect(res.body.data[0].unreadCount).toBe(2);
    expect(res.body.data[0].isOnline).toBe(false);
  });
});

// ── Messages badge ────────────────────────────────────────────────────────────

describe('GET /api/v1/chat/messages-badge', () => {
  it('returns unread DM count only', async () => {
    mockDM.count.mockResolvedValue(4);

    const res = await request(app)
      .get('/api/v1/chat/messages-badge')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(4);
    expect(mockDM.count).toHaveBeenCalledWith({
      where: { recipientId: USER_A, isRead: false },
    });
  });
});

// ── Mark as Read ──────────────────────────────────────────────────────────────

describe('POST /api/v1/chat/conversations/:userId/read', () => {
  it('marks messages as read', async () => {
    mockDM.updateMany.mockResolvedValue({ count: 3 });
    mockNotification.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post(`/api/v1/chat/conversations/${USER_B}/read`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.markedRead).toBe(3);
    expect(mockNotification.updateMany).toHaveBeenCalled();
  });
});

// ── Online Friends ────────────────────────────────────────────────────────────

describe('GET /api/v1/chat/friends/online', () => {
  const bobUserRow = {
    id: USER_B,
    username: 'bob',
    displayName: 'Bob',
    avatar: '',
    hakaId: null,
    profileHidden: false,
    activeSpecialId: null,
    activeSpecialIdLevel: null,
    activeSpecialIdExpiresAt: null,
    level: { richLevel: 1, charmLevel: 1 },
    storeItems: [],
    settings: { invisibleOnline: false },
  };

  beforeEach(() => {
    const onlineRoom = new Set(['socket-1']);
    (getIO as jest.Mock).mockReturnValue({
      to: jest.fn(() => ({ emit: jest.fn() })),
      sockets: {
        adapter: {
          rooms: new Map([[`user:${USER_B}`, onlineRoom]]),
        },
      },
    });
  });

  it('returns online users you follow or who follow you', async () => {
    mockFollow.findMany
      .mockResolvedValueOnce([{ targetId: USER_B }])
      .mockResolvedValueOnce([]);
    mockUser.findMany.mockResolvedValue([bobUserRow]);

    const res = await request(app)
      .get('/api/v1/chat/friends/online')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(USER_B);
    expect(res.body.data[0].isOnline).toBe(true);
  });

  it('excludes offline users in the follow graph', async () => {
    mockFollow.findMany
      .mockResolvedValueOnce([{ targetId: USER_C }])
      .mockResolvedValueOnce([]);
    mockUser.findMany.mockResolvedValue([
      { ...bobUserRow, id: USER_C, displayName: 'Carol' },
    ]);

    const res = await request(app)
      .get('/api/v1/chat/friends/online')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('excludes users with invisible online enabled', async () => {
    mockFollow.findMany
      .mockResolvedValueOnce([{ targetId: USER_B }])
      .mockResolvedValueOnce([]);
    mockUser.findMany.mockResolvedValue([
      { ...bobUserRow, settings: { invisibleOnline: true } },
    ]);

    const res = await request(app)
      .get('/api/v1/chat/friends/online')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

// ── Delete DM ─────────────────────────────────────────────────────────────────

describe('DELETE /api/v1/chat/conversations/messages/:messageId', () => {
  it('hides a message for the acting user only', async () => {
    mockDM.findUnique.mockResolvedValue({
      id: 'dm-1',
      senderId: USER_A,
      recipientId: USER_B,
      deletedForAllAt: null,
    });
    mockDMHidden.upsert.mockResolvedValue({ id: 'hide-1' });

    const res = await request(app)
      .delete('/api/v1/chat/conversations/messages/dm-1')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ mode: 'for_me' });

    expect(res.status).toBe(200);
    expect(res.body.data.hidden).toBe(true);
    expect(mockDMHidden.upsert).toHaveBeenCalled();
  });

  it('tombstones a message for everyone when sender deletes', async () => {
    // Single mockResolvedValueOnce: the service reads the message once on this
    // path, and jest.clearAllMocks() does NOT drop unconsumed once-values — a
    // leftover would leak a null into the next test's findUnique.
    mockDM.findUnique.mockResolvedValueOnce({
      id: 'dm-1',
      senderId: USER_A,
      recipientId: USER_B,
      deletedForAllAt: null,
    });
    mockDM.update.mockResolvedValue({
      id: 'dm-1',
      content: 'Secret',
      isRead: true,
      createdAt: '2026-04-07T10:00:00Z',
      sender: senderProfile,
      recipient: recipientProfile,
      ...baseDmFields({ deletedForAllAt: new Date('2026-04-07T10:05:00Z') }),
    });

    const res = await request(app)
      .delete('/api/v1/chat/conversations/messages/dm-1')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ mode: 'for_everyone' });

    expect(res.status).toBe(200);
    expect(res.body.data.isDeleted).toBe(true);
    expect(res.body.data.content).toBe('');
  });

  it('rejects delete-for-everyone from recipient', async () => {
    mockDM.findUnique.mockResolvedValue({
      id: 'dm-1',
      senderId: USER_B,
      recipientId: USER_A,
      deletedForAllAt: null,
    });

    const res = await request(app)
      .delete('/api/v1/chat/conversations/messages/dm-1')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ mode: 'for_everyone' });

    expect(res.status).toBe(403);
  });
});

// ── Forward DM ────────────────────────────────────────────────────────────────

describe('POST /api/v1/chat/conversations/messages/:messageId/forward', () => {
  it('forwards a text message to another user', async () => {
    mockDM.findUnique.mockResolvedValue({
      id: 'dm-1',
      senderId: USER_A,
      recipientId: USER_B,
      content: 'Forward me',
      messageType: 'text',
      mediaUrl: null,
      giftId: null,
      giftName: '',
      giftImage: '',
      giftIcon: '',
      giftQty: 0,
      giftCoinCost: 0,
      deletedForAllAt: null,
      hiddenFor: [],
    });
    mockUser.findUnique
      .mockResolvedValueOnce({ id: USER_C, isMuted: false })
      .mockResolvedValueOnce({ id: USER_C });
    mockDM.create.mockResolvedValue({
      id: 'dm-2',
      content: 'Forward me',
      isRead: false,
      createdAt: '2026-04-07T10:10:00Z',
      sender: senderProfile,
      recipient: { ...recipientProfile, id: USER_C, displayName: 'Carol' },
      ...baseDmFields(),
    });

    const res = await request(app)
      .post('/api/v1/chat/conversations/messages/dm-1/forward')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ recipientId: USER_C });

    expect(res.status).toBe(201);
    expect(res.body.data.content).toBe('Forward me');
  });

  it('rejects forwarding structured message types', async () => {
    mockDM.findUnique.mockResolvedValue({
      id: 'dm-1',
      senderId: USER_A,
      recipientId: USER_B,
      content: '{"kind":"coin_transfer"}',
      messageType: 'coin_transfer',
      mediaUrl: null,
      giftId: null,
      giftName: '',
      giftImage: '',
      giftIcon: '',
      giftQty: 0,
      giftCoinCost: 0,
      deletedForAllAt: null,
      hiddenFor: [],
    });

    const res = await request(app)
      .post('/api/v1/chat/conversations/messages/dm-1/forward')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ recipientId: USER_C });

    expect(res.status).toBe(400);
  });
});
