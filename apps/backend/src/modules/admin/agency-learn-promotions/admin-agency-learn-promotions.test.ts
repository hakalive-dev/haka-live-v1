import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../config/prisma';
import { resetDb, createTestUser, mintJwt, mintAdminJwt } from '../../../tests/db-helpers';

describe('admin agency-learn-promotions', () => {
  let adminToken = '';

  beforeEach(async () => {
    await resetDb();
    await prisma.agencyLearnPromotion.deleteMany();
    const admin = await createTestUser();
    adminToken = mintAdminJwt(admin.id, 'super_admin');
  });

  it('creates, lists, toggles, and deletes a promotion', async () => {
    const createRes = await request(app)
      .post('/api/v1/admin/agency-learn-promotions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        imageUrl: 'https://cdn.example.com/promo.png',
        title: 'TikTok Guide',
        description: 'How to attract users',
        linkUrl: 'https://example.com/guide',
        viewCount: 30867,
        likeCount: 1200,
        tag: 'Original',
        sortOrder: 1,
        isActive: true,
      });
    expect(createRes.status).toBe(201);
    const id = createRes.body.data.id as string;

    const listRes = await request(app)
      .get('/api/v1/admin/agency-learn-promotions')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);

    const toggleRes = await request(app)
      .patch(`/api/v1/admin/agency-learn-promotions/${id}/toggle`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(toggleRes.status).toBe(200);
    expect(toggleRes.body.data.isActive).toBe(false);

    const delRes = await request(app)
      .delete(`/api/v1/admin/agency-learn-promotions/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delRes.status).toBe(200);
  });

  it('rejects invalid linkUrl scheme', async () => {
    const res = await request(app)
      .post('/api/v1/admin/agency-learn-promotions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        imageUrl: 'https://cdn.example.com/promo.png',
        title: 'Bad link',
        linkUrl: 'javascript:alert(1)',
      });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/agency/learn-promotions', () => {
  beforeEach(async () => {
    await resetDb();
    await prisma.agencyLearnPromotion.deleteMany();
  });

  it('returns only active promotions for agents, sorted', async () => {
    const agent = await createTestUser({ role: 'agent' });
    const token = mintJwt(agent.id, 'agent');

    await prisma.agencyLearnPromotion.createMany({
      data: [
        {
          imageUrl: 'https://cdn.example.com/a.png',
          title: 'Inactive',
          sortOrder: 0,
          isActive: false,
        },
        {
          imageUrl: 'https://cdn.example.com/b.png',
          title: 'Second',
          sortOrder: 2,
          linkUrl: 'https://example.com/b',
          viewCount: 100,
          likeCount: 50,
        },
        {
          imageUrl: 'https://cdn.example.com/c.png',
          title: 'First',
          sortOrder: 1,
          linkUrl: 'https://example.com/c',
        },
      ],
    });

    const res = await request(app)
      .get('/api/v1/agency/learn-promotions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].title).toBe('First');
    expect(res.body.data[1].title).toBe('Second');
    expect(res.body.data[0]).toMatchObject({
      viewCount: expect.any(Number),
      likeCount: expect.any(Number),
      linkUrl: 'https://example.com/c',
    });
  });

  it('returns 403 for non-agent', async () => {
    const user = await createTestUser({ role: 'normal_user' });
    const res = await request(app)
      .get('/api/v1/agency/learn-promotions')
      .set('Authorization', `Bearer ${mintJwt(user.id)}`);
    expect(res.status).toBe(403);
  });
});
