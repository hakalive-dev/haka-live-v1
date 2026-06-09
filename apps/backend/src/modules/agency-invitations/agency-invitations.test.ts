import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/prisma';
import { resetDb, createTestUser, mintJwt, mintAdminJwt } from '../../tests/db-helpers';

async function makeAgency(ownerId: string, parentAgencyId: string | null = null) {
  return prisma.agency.create({
    data: { name: `A-${ownerId.slice(0, 4)}`, ownerId, parentAgencyId },
  });
}

describe('agency-invitations — owner routes', () => {
  beforeEach(async () => { await resetDb(); });

  it('parent owner creates a pending invitation', async () => {
    const parentOwner = await createTestUser();
    const subOwner = await createTestUser();
    const parent = await makeAgency(parentOwner.id);
    const sub = await makeAgency(subOwner.id);
    const token = mintJwt(parentOwner.id);

    const res = await request(app)
      .post('/api/v1/agency/invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({ toAgencyId: sub.id, note: 'join us' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.fromAgency.id).toBe(parent.id);
    expect(res.body.data.toAgency.id).toBe(sub.id);
    expect(res.body.data.fromAgency.name).toBeDefined();
    expect(res.body.data.toAgency.name).toBeDefined();
  });

  it('rejects creating when caller does not own fromAgency', async () => {
    const parentOwner = await createTestUser();
    const someoneElse = await createTestUser();
    const subOwner = await createTestUser();
    await makeAgency(parentOwner.id);
    const sub = await makeAgency(subOwner.id);
    const token = mintJwt(someoneElse.id);

    const res = await request(app)
      .post('/api/v1/agency/invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({ toAgencyId: sub.id });

    expect(res.status).toBe(403);
  });

  it('rejects creating when parent already has a parent (depth-2 cap)', async () => {
    const grandParentOwner = await createTestUser();
    const parentOwner = await createTestUser();
    const subOwner = await createTestUser();
    const grand = await makeAgency(grandParentOwner.id);
    const parent = await makeAgency(parentOwner.id, grand.id);   // parent is already a sub
    const sub = await makeAgency(subOwner.id);
    const token = mintJwt(parentOwner.id);

    const res = await request(app)
      .post('/api/v1/agency/invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({ toAgencyId: sub.id });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/chain_depth_violation/);
  });

  it('rejects creating when target is already a sub', async () => {
    const parentOwner = await createTestUser();
    const otherParentOwner = await createTestUser();
    const subOwner = await createTestUser();
    const parent = await makeAgency(parentOwner.id);
    const otherParent = await makeAgency(otherParentOwner.id);
    const sub = await makeAgency(subOwner.id, otherParent.id);   // already a sub
    const token = mintJwt(parentOwner.id);

    const res = await request(app)
      .post('/api/v1/agency/invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({ toAgencyId: sub.id });

    expect(res.status).toBe(409);
  });

  it('rejects creating when target is itself a parent', async () => {
    const parentOwner = await createTestUser();
    const subOwner1 = await createTestUser();
    const subOwner2 = await createTestUser();
    const parent = await makeAgency(parentOwner.id);
    const target = await makeAgency(subOwner1.id);
    await makeAgency(subOwner2.id, target.id);                    // target already has a sub
    const token = mintJwt(parentOwner.id);

    const res = await request(app)
      .post('/api/v1/agency/invitations')
      .set('Authorization', `Bearer ${token}`)
      .send({ toAgencyId: target.id });

    expect(res.status).toBe(409);
  });

  it('rejects duplicate pending invitation for same pair', async () => {
    const parentOwner = await createTestUser();
    const subOwner = await createTestUser();
    const parent = await makeAgency(parentOwner.id);
    const sub = await makeAgency(subOwner.id);
    const token = mintJwt(parentOwner.id);

    const r1 = await request(app)
      .post('/api/v1/agency/invitations').set('Authorization', `Bearer ${token}`)
      .send({ toAgencyId: sub.id });
    expect(r1.status).toBe(200);

    const r2 = await request(app)
      .post('/api/v1/agency/invitations').set('Authorization', `Bearer ${token}`)
      .send({ toAgencyId: sub.id });
    expect(r2.status).toBe(409);
    expect(r2.body.message).toMatch(/pending_invitation_exists/);
  });

  it('owner lists invitations they sent or received', async () => {
    const parentOwner = await createTestUser();
    const subOwner = await createTestUser();
    const parent = await makeAgency(parentOwner.id);
    const sub = await makeAgency(subOwner.id);
    await prisma.agencyInvitation.create({
      data: { fromAgencyId: parent.id, toAgencyId: sub.id, status: 'pending' },
    });

    const parentToken = mintJwt(parentOwner.id);
    const r1 = await request(app).get('/api/v1/agency/invitations').set('Authorization', `Bearer ${parentToken}`);
    expect(r1.status).toBe(200);
    expect(r1.body.data.sent.length).toBe(1);   // parentOwner sent it
    expect(r1.body.data.received.length).toBe(0);

    const subToken = mintJwt(subOwner.id);
    const r2 = await request(app).get('/api/v1/agency/invitations').set('Authorization', `Bearer ${subToken}`);
    expect(r2.status).toBe(200);
    expect(r2.body.data.sent.length).toBe(0);
    expect(r2.body.data.received.length).toBe(1); // subOwner received it
  });

  it('owner cancels a pending invitation they sent', async () => {
    const parentOwner = await createTestUser();
    const subOwner = await createTestUser();
    const parent = await makeAgency(parentOwner.id);
    const sub = await makeAgency(subOwner.id);
    const inv = await prisma.agencyInvitation.create({
      data: { fromAgencyId: parent.id, toAgencyId: sub.id, status: 'pending' },
    });
    const token = mintJwt(parentOwner.id);

    const res = await request(app)
      .post(`/api/v1/agency/invitations/${inv.id}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const row = await prisma.agencyInvitation.findUniqueOrThrow({ where: { id: inv.id } });
    expect(row.status).toBe('cancelled');
    expect(row.reviewedBy).toBe('');
  });

  it('rejects cancelling an invitation the caller did not send', async () => {
    const parentOwner = await createTestUser();
    const subOwner = await createTestUser();
    const parent = await makeAgency(parentOwner.id);
    const sub = await makeAgency(subOwner.id);
    const inv = await prisma.agencyInvitation.create({
      data: { fromAgencyId: parent.id, toAgencyId: sub.id, status: 'pending' },
    });
    const token = mintJwt(subOwner.id);
    const res = await request(app)
      .post(`/api/v1/agency/invitations/${inv.id}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('agency-invitations — admin routes', () => {
  let adminToken = '';
  beforeEach(async () => {
    await resetDb();
    const admin = await createTestUser();
    adminToken = mintAdminJwt(admin.id, 'super_admin');
  });

  it('admin approves pending invitation, attaching sub to parent atomically', async () => {
    const parentOwner = await createTestUser();
    const subOwner = await createTestUser();
    const parent = await makeAgency(parentOwner.id);
    const sub = await makeAgency(subOwner.id);
    const inv = await prisma.agencyInvitation.create({
      data: { fromAgencyId: parent.id, toAgencyId: sub.id, status: 'pending' },
    });

    const res = await request(app)
      .post(`/api/v1/admin/invitations/${inv.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');

    const subAfter = await prisma.agency.findUniqueOrThrow({ where: { id: sub.id } });
    expect(subAfter.parentAgencyId).toBe(parent.id);

    // Forward-only: parent cumulativeHostIncome unchanged at approval time.
    const parentAfter = await prisma.agency.findUniqueOrThrow({ where: { id: parent.id } });
    expect(BigInt(parentAfter.cumulativeHostIncome as unknown as string)).toBe(0n);
  });

  it('admin rejects pending invitation with optional note', async () => {
    const parentOwner = await createTestUser();
    const subOwner = await createTestUser();
    const parent = await makeAgency(parentOwner.id);
    const sub = await makeAgency(subOwner.id);
    const inv = await prisma.agencyInvitation.create({
      data: { fromAgencyId: parent.id, toAgencyId: sub.id, status: 'pending' },
    });

    const res = await request(app)
      .post(`/api/v1/admin/invitations/${inv.id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'policy violation' });
    expect(res.status).toBe(200);
    const row = await prisma.agencyInvitation.findUniqueOrThrow({ where: { id: inv.id } });
    expect(row.status).toBe('rejected');
    expect(row.note).toContain('policy violation');
  });

  it('admin cannot approve a non-pending invitation', async () => {
    const parentOwner = await createTestUser();
    const subOwner = await createTestUser();
    const parent = await makeAgency(parentOwner.id);
    const sub = await makeAgency(subOwner.id);
    const inv = await prisma.agencyInvitation.create({
      data: { fromAgencyId: parent.id, toAgencyId: sub.id, status: 'rejected' },
    });
    const res = await request(app)
      .post(`/api/v1/admin/invitations/${inv.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
  });

  it('admin approve re-verifies chain depth (target became a parent in between)', async () => {
    const parentOwner = await createTestUser();
    const subOwner = await createTestUser();
    const grandchildOwner = await createTestUser();
    const parent = await makeAgency(parentOwner.id);
    const sub = await makeAgency(subOwner.id);
    const inv = await prisma.agencyInvitation.create({
      data: { fromAgencyId: parent.id, toAgencyId: sub.id, status: 'pending' },
    });
    // Sub acquires a child between create and approve.
    await makeAgency(grandchildOwner.id, sub.id);

    const res = await request(app)
      .post(`/api/v1/admin/invitations/${inv.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/chain_depth_violation/);
  });

  it('admin lists invitations with status filter', async () => {
    const parentOwner = await createTestUser();
    const subOwner = await createTestUser();
    const parent = await makeAgency(parentOwner.id);
    const sub = await makeAgency(subOwner.id);
    await prisma.agencyInvitation.create({
      data: { fromAgencyId: parent.id, toAgencyId: sub.id, status: 'pending' },
    });
    const res = await request(app)
      .get('/api/v1/admin/invitations?status=pending')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.rows.length).toBe(1);
  });
});
