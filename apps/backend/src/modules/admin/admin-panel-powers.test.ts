import request from 'supertest';
import app from '../../app';
import {
  createTestUser,
  mintAdminJwt,
  resetDb,
} from '../../tests/db-helpers';
import { prisma } from '../../config/prisma';
import { setPassword } from '../accounts/accounts.service';
import { getUserDetail } from './users/admin-users.service';
import * as rekognition from '../face-verification/rekognition-faces.service';

jest.mock('../face-verification/rekognition-faces.service', () => ({
  deleteUserFace: jest.fn().mockResolvedValue(undefined),
  indexUserFace: jest.fn(),
  validateSessionFrames: jest.fn(),
}));

// getUser is overridden per-test to return the email being verified.
const mockSupabaseGetUser = jest.fn();
jest.mock('../../config/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: jest.fn().mockResolvedValue({ error: null }),
      getUser: (...args: unknown[]) => mockSupabaseGetUser(...args),
      admin: { updateUserById: jest.fn().mockResolvedValue({ error: null }) },
    },
  },
}));

beforeEach(async () => {
  await resetDb();
  jest.clearAllMocks();
});

function adminAuth() {
  const admin = createTestUser();
  return admin.then((u) => mintAdminJwt(u.id, 'super_admin'));
}

describe('Admin panel powers', () => {
  it('stores password snapshot on setPassword and exposes in getUserDetail', async () => {
    const user = await createTestUser();
    const email = `pwtest_${user.id}@example.com`;
    await prisma.user.update({ where: { id: user.id }, data: { email } });
    // setPassword now requires an email-OTP token whose verified email matches the account.
    mockSupabaseGetUser.mockResolvedValue({ data: { user: { email } }, error: null });
    await setPassword(user.id, 'myPassword99', 'verified-otp-token');
    const detail = await getUserDetail(user.id, { canViewPassword: true });
    expect(detail.hasPassword).toBe(true);
    expect(detail.loginPasswordDisplay).toBe('myPassword99');
    expect(detail.loginPasswordCopyable).toBe(true);
  });

  it('includes gender in getUserDetail', async () => {
    const user = await createTestUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { gender: 'female', country: 'GB' },
    });
    const detail = await getUserDetail(user.id);
    expect(detail.gender).toBe('female');
    expect(detail.country).toBe('GB');
  });

  it('accepts force level up to 100 and rejects 101', async () => {
    const user = await createTestUser();
    const token = await adminAuth();

    await request(app)
      .patch(`/api/v1/admin/users/${user.id}/level`)
      .set('Authorization', `Bearer ${token}`)
      .send({ richLevel: 50, charmLevel: 50 })
      .expect(200);

    const level = await prisma.userLevel.findUnique({ where: { userId: user.id } });
    expect(level?.richLevel).toBe(50);
    expect(level?.charmLevel).toBe(50);

    await request(app)
      .patch(`/api/v1/admin/users/${user.id}/level`)
      .set('Authorization', `Bearer ${token}`)
      .send({ richLevel: 101 })
      .expect(400);
  });

  it('admin can override gender via profile endpoint', async () => {
    const user = await createTestUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { gender: 'male', onboardingComplete: true, hakaId: '999001' },
    });
    const token = await adminAuth();

    await request(app)
      .patch(`/api/v1/admin/users/${user.id}/profile/gender`)
      .set('Authorization', `Bearer ${token}`)
      .send({ gender: 'female' })
      .expect(200);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.gender).toBe('female');
  });

  it('lists agents without a coin seller profile in seller coins', async () => {
    const agentWithProfile = await createTestUser({ role: 'agent', displayName: 'Agent With Profile' });
    const agentWithoutProfile = await createTestUser({ role: 'agent', displayName: 'Agent No Profile' });
    await prisma.coinSellerProfile.create({
      data: { userId: agentWithProfile.id, availableBalance: 100 },
    });
    const token = await adminAuth();

    const res = await request(app)
      .get('/api/v1/admin/seller-coins')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const sellerIds = (res.body.data.sellers as Array<{ id: string }>).map((s) => s.id);
    expect(sellerIds).toContain(agentWithProfile.id);
    expect(sellerIds).toContain(agentWithoutProfile.id);
    expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(2);
  });

  it('deducts coins from coin seller balance', async () => {
    const user = await createTestUser();
    await prisma.coinSellerProfile.create({
      data: {
        userId: user.id,
        availableBalance: 5000,
        totalBalance: 5000,
      },
    });
    const token = await adminAuth();

    const res = await request(app)
      .post(`/api/v1/admin/seller-coins/${user.id}/deduct`)
      .set('Authorization', `Bearer ${token}`)
      .send({ coins: 1000, reason: 'Inventory correction' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.deducted).toBe(1000);
    expect(res.body.data.newAvailableBalance).toBe(4000);

    const tx = await prisma.coinSellerTransaction.findFirst({
      where: { sellerId: user.id, transactionType: 'admin_deduct' },
    });
    expect(tx).toBeTruthy();
  });

  it('resets face verification for approved user', async () => {
    const user = await createTestUser();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        faceVerificationStatus: 'approved',
        faceEnrollmentId: 'face-abc',
        facePhotoUrl: 'https://example.com/face.jpg',
        faceVerifiedAt: new Date(),
      },
    });
    const token = await adminAuth();

    await request(app)
      .post(`/api/v1/admin/users/${user.id}/reset-face-verification`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(rekognition.deleteUserFace).toHaveBeenCalledWith('face-abc');
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.faceVerificationStatus).toBe('none');
    expect(updated.faceEnrollmentId).toBe('');
  });

  it('sets super admin power on user settings', async () => {
    const user = await createTestUser();
    const token = await adminAuth();

    await request(app)
      .patch(`/api/v1/admin/users/${user.id}/super-admin-power`)
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: true })
      .expect(200);

    const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
    expect(settings?.superAdminPower).toBe(true);
  });

  it('protects super admin power user from host kick', async () => {
    const host = await createTestUser({ role: 'host' });
    const powerUser = await createTestUser();
    await prisma.userSettings.create({
      data: { userId: powerUser.id, superAdminPower: true },
    });

    const room = await prisma.room.create({
      data: {
        hostId: host.id,
        title: 'Test Room',
        status: 'live',
        micConfig: 5,
        agoraChannel: `room-${host.id.slice(0, 8)}`,
        seats: { create: [{ position: 1, userId: host.id }, { position: 2 }] },
      },
    });

    const { kickUserFromRoom } = await import('../rooms/rooms.service');
    await expect(
      kickUserFromRoom(room.id, powerUser.id, host.id),
    ).rejects.toThrow(/super admin power/i);
  });
});

describe('Send login OTP', () => {
  it('requires user phone', async () => {
    const user = await createTestUser();
    const token = await adminAuth();

    await request(app)
      .post(`/api/v1/admin/users/${user.id}/send-login-otp`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);
  });

  it('sends OTP when phone exists', async () => {
    const user = await createTestUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { phone: '+919876543210' },
    });
    const token = await adminAuth();

    const res = await request(app)
      .post(`/api/v1/admin/users/${user.id}/send-login-otp`)
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'sms' })
      .expect(200);

    expect(res.body.data.sent).toBe(true);
  });
});
