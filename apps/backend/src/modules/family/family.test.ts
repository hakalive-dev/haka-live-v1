import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/prisma';

jest.mock('../../middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: req.headers['x-test-user-id'] || 'user-1' };
    next();
  },
  optionalAuth: (_req: any, _res: any, next: any) => next(),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

async function makeUser(id: string) {
  return prisma.user.upsert({
    where: { id },
    create: {
      id,
      supabaseUid: `supabase-${id}`,
      displayName: `User ${id}`,
      hakaId: `haka-${id}`,
    },
    update: {},
  });
}

beforeEach(async () => {
  await prisma.familyMember.deleteMany();
  await prisma.family.deleteMany();
  await prisma.user.deleteMany({ where: { id: { in: ['user-1', 'user-2', 'user-3'] } } });
  await makeUser('user-1');
  await makeUser('user-2');
  await makeUser('user-3');
});

afterAll(async () => {
  await prisma.familyMember.deleteMany();
  await prisma.family.deleteMany();
  await prisma.user.deleteMany({ where: { id: { in: ['user-1', 'user-2', 'user-3'] } } });
  await prisma.$disconnect();
});

describe('Family System', () => {
  it('creates a family and adds owner as member', async () => {
    const res = await request(app)
      .post('/api/v1/family')
      .set('x-test-user-id', 'user-1')
      .send({ name: 'Test Family', announcement: 'Welcome!' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Test Family');

    const member = await prisma.familyMember.findUnique({ where: { userId: 'user-1' } });
    expect(member?.role).toBe('owner');
  });

  it('prevents creating a second family when already in one', async () => {
    await request(app)
      .post('/api/v1/family')
      .set('x-test-user-id', 'user-1')
      .send({ name: 'Family One' });

    const res = await request(app)
      .post('/api/v1/family')
      .set('x-test-user-id', 'user-1')
      .send({ name: 'Family Two' });

    expect(res.status).toBe(400);
  });

  it('allows another user to join a family', async () => {
    const createRes = await request(app)
      .post('/api/v1/family')
      .set('x-test-user-id', 'user-1')
      .send({ name: 'Joinable Family' });

    const familyId = createRes.body.data.id;

    const joinRes = await request(app)
      .post(`/api/v1/family/${familyId}/join`)
      .set('x-test-user-id', 'user-2');

    expect(joinRes.status).toBe(200);

    const member = await prisma.familyMember.findUnique({ where: { userId: 'user-2' } });
    expect(member?.role).toBe('member');
  });

  it('allows a member to leave', async () => {
    const createRes = await request(app)
      .post('/api/v1/family')
      .set('x-test-user-id', 'user-1')
      .send({ name: 'Leave Test' });

    const familyId = createRes.body.data.id;
    await request(app).post(`/api/v1/family/${familyId}/join`).set('x-test-user-id', 'user-2');

    const leaveRes = await request(app)
      .post('/api/v1/family/leave')
      .set('x-test-user-id', 'user-2');

    expect(leaveRes.status).toBe(200);
    const member = await prisma.familyMember.findUnique({ where: { userId: 'user-2' } });
    expect(member).toBeNull();
  });

  it('prevents owner from leaving', async () => {
    await request(app)
      .post('/api/v1/family')
      .set('x-test-user-id', 'user-1')
      .send({ name: 'Owner Leave Test' });

    const res = await request(app)
      .post('/api/v1/family/leave')
      .set('x-test-user-id', 'user-1');

    expect(res.status).toBe(400);
  });

  it('owner can disband family', async () => {
    await request(app)
      .post('/api/v1/family')
      .set('x-test-user-id', 'user-1')
      .send({ name: 'Disband Me' });

    const res = await request(app)
      .delete('/api/v1/family')
      .set('x-test-user-id', 'user-1');

    expect(res.status).toBe(200);
    const families = await prisma.family.findMany();
    expect(families).toHaveLength(0);
  });
});
