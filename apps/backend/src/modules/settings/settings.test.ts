/**
 * Settings module tests
 * Tests: GET /settings, PATCH /settings
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
    userSettings: {
      upsert: jest.fn(),
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
const USER_ID = 'user-settings-1';

function makeToken(userId = USER_ID) {
  return jwt.sign({ sub: userId, role: 'normal_user' }, JWT_SECRET, { expiresIn: '15m' });
}

const mockUserSettings = prisma.userSettings as unknown as { upsert: jest.Mock };

const defaultSettingsRow = {
  id: 'settings-1',
  userId: USER_ID,
  liveRoomAlerts: true,
  messageNotifications: true,
  soundEnabled: true,
  vibrateEnabled: true,
  whoCanMessage: 'everyone',
  cameraAccess: true,
  voiceAccess: true,
  locationAccess: false,
  invisibleVisitor: false,
  mysteryManLive: false,
  mysteryManRank: false,
  invisibleOnline: false,
  exclusiveEmailNotification: false,
  hideLivestreamLevel: false,
  callsEnabled: true,
  language: 'en',
  useSystemLanguage: true,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/settings', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/v1/settings');
    expect(res.status).toBe(401);
  });

  it('returns user settings', async () => {
    mockUserSettings.upsert.mockResolvedValue(defaultSettingsRow);

    const res = await request(app)
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('live_room_alerts');
    expect(res.body.data).toHaveProperty('sound_enabled');
    expect(res.body.data).toHaveProperty('who_can_message');
    expect(res.body.data.live_room_alerts).toBe(true);
    expect(res.body.data.language).toBe('en');
  });

  it('creates default settings if user has none', async () => {
    mockUserSettings.upsert.mockResolvedValue(defaultSettingsRow);

    const res = await request(app)
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(mockUserSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID },
        create: { userId: USER_ID },
      }),
    );
  });
});

describe('PATCH /api/v1/settings', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).patch('/api/v1/settings').send({ sound_enabled: false });
    expect(res.status).toBe(401);
  });

  it('updates a single setting', async () => {
    const updatedRow = { ...defaultSettingsRow, soundEnabled: false };
    mockUserSettings.upsert.mockResolvedValue(updatedRow);

    const res = await request(app)
      .patch('/api/v1/settings')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ sound_enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.data.sound_enabled).toBe(false);
  });

  it('updates multiple settings at once', async () => {
    const updatedRow = {
      ...defaultSettingsRow,
      soundEnabled: false,
      vibrateEnabled: false,
      invisibleOnline: true,
    };
    mockUserSettings.upsert.mockResolvedValue(updatedRow);

    const res = await request(app)
      .patch('/api/v1/settings')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ sound_enabled: false, vibrate_enabled: false, invisible_online: true });

    expect(res.status).toBe(200);
    expect(res.body.data.sound_enabled).toBe(false);
    expect(res.body.data.vibrate_enabled).toBe(false);
    expect(res.body.data.invisible_online).toBe(true);
  });

  it('ignores unknown fields silently', async () => {
    mockUserSettings.upsert.mockResolvedValue(defaultSettingsRow);

    const res = await request(app)
      .patch('/api/v1/settings')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ unknown_field: 'value', sound_enabled: true });

    expect(res.status).toBe(200);
  });
});
