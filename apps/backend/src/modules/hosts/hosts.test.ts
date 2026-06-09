import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/prisma';
import { resetDb, createTestUser, mintJwt, getWalletBalance } from '../../tests/db-helpers';

beforeEach(async () => { await resetDb(); });

const verifiedFemaleHost = {
  role: 'host' as const,
  hostType: 'independent' as const,
  gender: 'female',
  isVerifiedHost: true,
};

describe('GET /api/v1/hosts/level-task/rules', () => {
  it('returns rules for any authenticated user', async () => {
    const user = await createTestUser({ role: 'normal_user' });
    const res = await request(app)
      .get('/api/v1/hosts/level-task/rules')
      .set('Authorization', `Bearer ${mintJwt(user.id, 'normal_user')}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      rules: expect.objectContaining({
        newHosts: expect.any(Object),
        ordinary: expect.any(Object),
        tiers: expect.any(Array),
      }),
    });
  });
});

describe('GET /api/v1/hosts/me/level-task', () => {
  it('returns level task status for an eligible host', async () => {
    const host = await createTestUser(verifiedFemaleHost);

    const res = await request(app)
      .get('/api/v1/hosts/me/level-task')
      .set('Authorization', `Bearer ${mintJwt(host.id, 'host')}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      eligible: true,
      track: expect.stringMatching(/new_host|ordinary|level/),
      sevenDayEarnings: expect.any(Number),
      taskDayTimezone: 'UTC',
      rules: expect.objectContaining({ tiers: expect.any(Array) }),
    });
  });

  it('rejects non-host callers', async () => {
    const user = await createTestUser({ role: 'normal_user' });
    const res = await request(app)
      .get('/api/v1/hosts/me/level-task')
      .set('Authorization', `Bearer ${mintJwt(user.id, 'normal_user')}`);
    expect(res.status).toBe(403);
  });

  it('rejects male hosts', async () => {
    const host = await createTestUser({
      ...verifiedFemaleHost,
      gender: 'male',
    });
    const res = await request(app)
      .get('/api/v1/hosts/me/level-task')
      .set('Authorization', `Bearer ${mintJwt(host.id, 'host')}`);
    expect(res.status).toBe(403);
  });

  it('rejects unverified female hosts', async () => {
    const host = await createTestUser({
      ...verifiedFemaleHost,
      isVerifiedHost: false,
    });
    const res = await request(app)
      .get('/api/v1/hosts/me/level-task')
      .set('Authorization', `Bearer ${mintJwt(host.id, 'host')}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/hosts/me/level-task/claim-live', () => {
  it('claims live reward when host has enough qualifying mic minutes', async () => {
    const host = await createTestUser(verifiedFemaleHost);
    const room = await prisma.room.create({
      data: {
        hostId: host.id,
        title: 'Test',
        status: 'live',
        roomMode: 'chat',
        agoraChannel: `test-${host.id.slice(0, 8)}`,
      },
    });
    const startedAt = new Date(Date.now() - 65 * 60 * 1000);
    await prisma.hostMicSession.create({
      data: {
        userId: host.id,
        roomId: room.id,
        roomMode: 'chat',
        seatIndex: 0,
        startedAt,
        endedAt: new Date(),
        minutes: 65,
        beansAwarded: 0,
      },
    });

    const res = await request(app)
      .post('/api/v1/hosts/me/level-task/claim-live')
      .set('Authorization', `Bearer ${mintJwt(host.id, 'host')}`);

    expect(res.status).toBe(200);
    expect(res.body.data.beansAwarded).toBeGreaterThan(0);
    const balance = await getWalletBalance(host.id);
    expect(balance.beans).toBe(res.body.data.beansAwarded);
  });

  it('ignores non-qualifying room mode for mic minutes', async () => {
    const host = await createTestUser(verifiedFemaleHost);
    const room = await prisma.room.create({
      data: {
        hostId: host.id,
        title: 'Test',
        status: 'live',
        agoraChannel: `test2-${host.id.slice(0, 8)}`,
      },
    });
    const startedAt = new Date(Date.now() - 65 * 60 * 1000);
    await prisma.hostMicSession.create({
      data: {
        userId: host.id,
        roomId: room.id,
        roomMode: 'unknown_mode',
        seatIndex: 0,
        startedAt,
        endedAt: new Date(),
        minutes: 65,
        beansAwarded: 0,
      },
    });

    const res = await request(app)
      .post('/api/v1/hosts/me/level-task/claim-live')
      .set('Authorization', `Bearer ${mintJwt(host.id, 'host')}`);

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/hosts/me/level-task/claim-income', () => {
  it('rejects income claim for new host track', async () => {
    const host = await createTestUser(verifiedFemaleHost);

    const res = await request(app)
      .post('/api/v1/hosts/me/level-task/claim-income')
      .set('Authorization', `Bearer ${mintJwt(host.id, 'host')}`);

    expect(res.status).toBe(400);
  });
});
