import request from 'supertest';
import app from '../../app';
import { createTestUser, mintJwt, resetDb } from '../../tests/db-helpers';
import * as faceNotify from './face-verification-notify.service';

jest.mock('./rekognition-faces.service', () => ({
  validateSessionFrames: jest.fn().mockResolvedValue({
    referenceUrl: 'https://example.com/nod.jpg',
    similarities: { turn_left: 95, turn_right: 92, blink: 91, smile: 90 },
  }),
  indexUserFace: jest.fn().mockResolvedValue('mock-face-id-123'),
  fetchImageBytes: jest.fn(),
  assertSingleFace: jest.fn(),
  assertSamePerson: jest.fn(),
}));

jest.mock('./face-verification-notify.service', () => ({
  notifyAdminsFaceVerificationSubmitted: jest.fn().mockResolvedValue(undefined),
  notifyUserFaceVerificationApproved: jest.fn(),
  notifyUserFaceVerificationRejected: jest.fn(),
}));

beforeEach(async () => {
  await resetDb();
});

describe('Face verification API', () => {
  it('creates a session and returns challenges', async () => {
    const user = await createTestUser();
    const res = await request(app)
      .post('/api/v1/face-verification/session')
      .set('Authorization', `Bearer ${mintJwt(user.id)}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.sessionId).toBeTruthy();
    expect(res.body.data.challenges).toHaveLength(5);
  });

  it('registers frames and submits for admin review', async () => {
    const user = await createTestUser();
    const token = mintJwt(user.id);

    const createRes = await request(app)
      .post('/api/v1/face-verification/session')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const sessionId = createRes.body.data.sessionId;
    const steps = ['nod', 'turn_left', 'turn_right', 'blink', 'smile'] as const;

    for (const step of steps) {
      await request(app)
        .post(`/api/v1/face-verification/session/${sessionId}/frame`)
        .set('Authorization', `Bearer ${token}`)
        .send({ step, publicUrl: `https://example.com/${step}.jpg` })
        .expect(200);
    }

    const submitRes = await request(app)
      .post(`/api/v1/face-verification/session/${sessionId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(submitRes.body.data.status).toBe('pending_admin');

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(meRes.body.data.faceVerificationStatus).toBe('pending_admin');
    expect(faceNotify.notifyAdminsFaceVerificationSubmitted).toHaveBeenCalledWith(
      user.id,
      sessionId,
    );
  });
});
