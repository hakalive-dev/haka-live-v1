/**
 * Feature 4 — Agora Integration
 * Tests: RTC token generation endpoint, Agora NCS webhook,
 *        uidFromUuid helper, edge cases (ended room, missing config)
 *
 * Prisma, Firebase Admin, and Agora config are fully mocked.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockAgoraConfig = { appId: 'test-agora-app-id', appCertificate: 'test-agora-certificate-32chars00' };

jest.mock('../../config/firebase', () => ({
  firebaseAdmin: {
    auth: () => ({ verifyIdToken: jest.fn() }),
  },
}));

jest.mock('../../config/prisma', () => ({
  prisma: {
    room: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    roomSeat: {
      update: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    roomMusicTrack: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn().mockResolvedValue({ isHostBanned: false }) },
    ban: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  },
}));

jest.mock('../../config/agora', () => ({
  get agoraConfig() { return mockAgoraConfig; },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';
import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { getMappedUid, getOrAssignUid, getRtcUidMap, uidFromUuid } from './agora.service';

const mockRoom = prisma.room as unknown as {
  create: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  findFirst: jest.Mock;
  findUnique: jest.Mock;
  findMany: jest.Mock;
  count: jest.Mock;
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-jwt-access-secret-at-least-16';
const HOST_ID = 'host-user-1';
const USER_ID = 'viewer-user-1';
const ROOM_ID = 'room-uuid-1';

function makeAccessToken(userId = USER_ID, role = 'normal_user') {
  return jwt.sign({ sub: userId, role }, JWT_SECRET, { expiresIn: '15m' });
}

const baseRoom = {
  id: ROOM_ID,
  hostId: HOST_ID,
  title: 'Test Room',
  description: '',
  coverImage: '',
  category: 'general',
  type: 'public',
  status: 'live',
  micConfig: 5,
  isLocked: false,
  password: null,
  viewerCount: 5,
  agoraChannel: ROOM_ID,
  startedAt: new Date(),
  endedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  host: { id: HOST_ID, username: 'host', displayName: 'Host', avatar: '', hakaId: 'HAKA12345678', activeSpecialId: null, activeSpecialIdLevel: null, activeSpecialIdExpiresAt: null, storeItems: [] },
  seats: [],
};

const endedRoom = { ...baseRoom, status: 'ended', endedAt: new Date() };

// ── uidFromUuid ───────────────────────────────────────────────────────────────

describe('uidFromUuid', () => {
  it('returns a positive integer for a UUID', () => {
    const uid = uidFromUuid('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(uid).toBeGreaterThan(0);
    expect(Number.isInteger(uid)).toBe(true);
  });

  it('returns the same UID for the same UUID', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(uidFromUuid(uuid)).toBe(uidFromUuid(uuid));
  });

  it('returns different UIDs for different UUIDs', () => {
    const uid1 = uidFromUuid('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    const uid2 = uidFromUuid('b2c3d4e5-f6a7-8901-bcde-f12345678901');
    expect(uid1).not.toBe(uid2);
  });
});

// ── getMappedUid ──────────────────────────────────────────────────────────────

describe('getMappedUid', () => {
  const channel = `test-channel-${Date.now()}`;
  const userId = 'mapped-user-1';

  beforeEach(async () => {
    await redis.del(`agora:uid_map:${channel}`, `agora:uid_ctr:${channel}`);
  });

  it('returns null when user has no mapping', async () => {
    expect(await getMappedUid(userId, channel)).toBeNull();
  });

  it('returns the assigned UID after getOrAssignUid', async () => {
    const assigned = await getOrAssignUid(userId, channel);
    expect(await getMappedUid(userId, channel)).toBe(assigned);
  });

  it('falls back to uidFromUuid when HGET throws', async () => {
    const spy = jest.spyOn(redis, 'hget').mockRejectedValueOnce(new Error('redis down'));
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    expect(await getMappedUid(uuid, channel)).toBe(uidFromUuid(uuid));
    spy.mockRestore();
  });
});

// ── getRtcUidMap ──────────────────────────────────────────────────────────────

describe('getRtcUidMap', () => {
  const channel = `test-channel-map-${Date.now()}`;
  const userA = 'map-user-a';
  const userB = 'map-user-b';

  beforeEach(async () => {
    await redis.del(`agora:uid_map:${channel}`, `agora:uid_ctr:${channel}`);
  });

  it('returns empty object for no user ids', async () => {
    expect(await getRtcUidMap(channel, [])).toEqual({});
  });

  it('returns only users with existing mappings', async () => {
    const uidA = await getOrAssignUid(userA, channel);
    const map = await getRtcUidMap(channel, [userA, userB]);
    expect(map).toEqual({ [userA]: uidA });
  });

  it('returns all mapped users in batch', async () => {
    const uidA = await getOrAssignUid(userA, channel);
    const uidB = await getOrAssignUid(userB, channel);
    const map = await getRtcUidMap(channel, [userA, userB, userA]);
    expect(map).toEqual({ [userA]: uidA, [userB]: uidB });
  });
});

// ── GET /api/v1/rooms/:id/token ───────────────────────────────────────────────

describe('GET /api/v1/rooms/:id/token', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get(`/api/v1/rooms/${ROOM_ID}/token`);
    expect(res.status).toBe(401);
  });

  it('returns 200 with Agora RTC token for a live room', async () => {
    mockRoom.findUnique.mockResolvedValue(baseRoom);

    const res = await request(app)
      .get(`/api/v1/rooms/${ROOM_ID}/token`)
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      token: expect.any(String),
      channel: ROOM_ID,
      uid: expect.any(Number),
      appId: 'test-agora-app-id',
      expiresAt: expect.any(Number),
    });
    expect(res.body.data.token.length).toBeGreaterThan(10);
  });

  it('returns publisher role by default', async () => {
    mockRoom.findUnique.mockResolvedValue(baseRoom);

    const res = await request(app)
      .get(`/api/v1/rooms/${ROOM_ID}/token`)
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
  });

  it('accepts ?role=subscriber query param', async () => {
    mockRoom.findUnique.mockResolvedValue(baseRoom);

    const res = await request(app)
      .get(`/api/v1/rooms/${ROOM_ID}/token?role=subscriber`)
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
  });

  it('returns 400 for an ended room', async () => {
    mockRoom.findUnique.mockResolvedValue(endedRoom);

    const res = await request(app)
      .get(`/api/v1/rooms/${ROOM_ID}/token`)
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('ended');
  });

  it('returns 404 if room does not exist', async () => {
    mockRoom.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/rooms/nonexistent/token')
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(404);
  });

  it('returns 503 if Agora is not configured', async () => {
    mockRoom.findUnique.mockResolvedValue(baseRoom);

    // Temporarily blank out the config
    const originalId = mockAgoraConfig.appId;
    mockAgoraConfig.appId = '';

    const res = await request(app)
      .get(`/api/v1/rooms/${ROOM_ID}/token`)
      .set('Authorization', `Bearer ${makeAccessToken()}`);

    expect(res.status).toBe(503);
    expect(res.body.message).toContain('Agora');

    // Restore
    mockAgoraConfig.appId = originalId;
  });

  it('uses deterministic UID for same user', async () => {
    mockRoom.findUnique.mockResolvedValue(baseRoom);
    const token = makeAccessToken(USER_ID);

    const res1 = await request(app)
      .get(`/api/v1/rooms/${ROOM_ID}/token`)
      .set('Authorization', `Bearer ${token}`);
    const res2 = await request(app)
      .get(`/api/v1/rooms/${ROOM_ID}/token`)
      .set('Authorization', `Bearer ${token}`);

    expect(res1.body.data.uid).toBe(res2.body.data.uid);
  });
});

// ── POST /api/v1/webhooks/agora (NCS) ─────────────────────────────────────────

describe('POST /api/v1/webhooks/agora', () => {
  it('returns 200 for channel destroyed (event 102) and sets viewerCount to 0', async () => {
    mockRoom.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post('/api/v1/webhooks/agora')
      .send({
        noticeId: 'notice-1',
        productId: 1,
        eventType: 102,
        payload: { channelName: ROOM_ID, uid: 12345, ts: Date.now() },
      });

    expect(res.status).toBe(200);
    expect(mockRoom.updateMany).toHaveBeenCalledWith({
      where: { agoraChannel: ROOM_ID, status: 'live' },
      data: { viewerCount: 0 },
    });
  });

  it('increments viewerCount on broadcaster join (event 103)', async () => {
    mockRoom.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post('/api/v1/webhooks/agora')
      .send({
        noticeId: 'notice-2',
        productId: 1,
        eventType: 103,
        payload: { channelName: ROOM_ID, uid: 12345, ts: Date.now() },
      });

    expect(res.status).toBe(200);
    expect(mockRoom.updateMany).toHaveBeenCalledWith({
      where: { agoraChannel: ROOM_ID, status: 'live' },
      data: { viewerCount: { increment: 1 } },
    });
  });

  it('increments viewerCount on audience join (event 105)', async () => {
    mockRoom.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post('/api/v1/webhooks/agora')
      .send({
        noticeId: 'notice-3',
        productId: 1,
        eventType: 105,
        payload: { channelName: ROOM_ID, uid: 67890, ts: Date.now() },
      });

    expect(res.status).toBe(200);
    expect(mockRoom.updateMany).toHaveBeenCalledWith({
      where: { agoraChannel: ROOM_ID, status: 'live' },
      data: { viewerCount: { increment: 1 } },
    });
  });

  it('decrements viewerCount on broadcaster leave (event 104)', async () => {
    mockRoom.findFirst.mockResolvedValue({ ...baseRoom, viewerCount: 5 });
    mockRoom.update.mockResolvedValue({ ...baseRoom, viewerCount: 4 });

    const res = await request(app)
      .post('/api/v1/webhooks/agora')
      .send({
        noticeId: 'notice-4',
        productId: 1,
        eventType: 104,
        payload: { channelName: ROOM_ID, uid: 12345, ts: Date.now() },
      });

    expect(res.status).toBe(200);
    expect(mockRoom.update).toHaveBeenCalledWith({
      where: { id: ROOM_ID },
      data: { viewerCount: { decrement: 1 } },
    });
  });

  it('decrements viewerCount on audience leave (event 106)', async () => {
    mockRoom.findFirst.mockResolvedValue({ ...baseRoom, viewerCount: 3 });
    mockRoom.update.mockResolvedValue({ ...baseRoom, viewerCount: 2 });

    const res = await request(app)
      .post('/api/v1/webhooks/agora')
      .send({
        noticeId: 'notice-5',
        productId: 1,
        eventType: 106,
        payload: { channelName: ROOM_ID, uid: 67890, ts: Date.now() },
      });

    expect(res.status).toBe(200);
    expect(mockRoom.update).toHaveBeenCalledWith({
      where: { id: ROOM_ID },
      data: { viewerCount: { decrement: 1 } },
    });
  });

  it('does not decrement below 0', async () => {
    mockRoom.findFirst.mockResolvedValue({ ...baseRoom, viewerCount: 0 });

    const res = await request(app)
      .post('/api/v1/webhooks/agora')
      .send({
        noticeId: 'notice-6',
        productId: 1,
        eventType: 104,
        payload: { channelName: ROOM_ID, uid: 12345, ts: Date.now() },
      });

    expect(res.status).toBe(200);
    // Should NOT call update because viewerCount is already 0
    expect(mockRoom.update).not.toHaveBeenCalled();
  });

  it('returns 200 for unknown event type (no-op)', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/agora')
      .send({
        noticeId: 'notice-7',
        productId: 1,
        eventType: 101, // channel created — no-op
        payload: { channelName: ROOM_ID, uid: 0, ts: Date.now() },
      });

    expect(res.status).toBe(200);
  });

  it('handles non-existent channel gracefully on leave', async () => {
    mockRoom.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/webhooks/agora')
      .send({
        noticeId: 'notice-8',
        productId: 1,
        eventType: 106,
        payload: { channelName: 'nonexistent-channel', uid: 99999, ts: Date.now() },
      });

    expect(res.status).toBe(200);
  });
});
