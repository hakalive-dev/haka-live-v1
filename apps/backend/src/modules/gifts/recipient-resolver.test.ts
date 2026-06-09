import { resolveGiftRecipient } from './recipient-resolver';
import { resetDb, createTestUser, createTestAgency, createTestCoinSellerProfile } from '../../tests/db-helpers';

beforeEach(async () => {
  await resetDb();
});

describe('resolveGiftRecipient (real DB)', () => {
  it('400s when both IDs provided', async () => {
    await expect(
      resolveGiftRecipient({ recipientId: 'u1', recipientAgencyId: 'a1' }),
    ).rejects.toThrow(/exactly one/i);
  });

  it('400s when neither provided', async () => {
    await expect(resolveGiftRecipient({})).rejects.toThrow(/exactly one/i);
  });

  it('normal user → user destination, no agency', async () => {
    const u = await createTestUser({ role: 'normal_user' });
    const ctx = await resolveGiftRecipient({ recipientId: u.id });
    expect(ctx.destinationKind).toBe('user');
    expect(ctx.hostUser.id).toBe(u.id);
    expect(ctx.agency).toBeNull();
    expect(ctx.giftTransaction.recipientType).toBe('user');
    expect(ctx.giftTransaction.recipientAgencyId).toBeNull();
  });

  it('agent-host user → user destination, agency = agent.ownedAgency', async () => {
    const agent = await createTestUser({ role: 'agent' });
    const agency = await createTestAgency({ ownerId: agent.id });
    const host = await createTestUser({ role: 'host', hostType: 'agent_host', agentId: agent.id });

    const ctx = await resolveGiftRecipient({ recipientId: host.id });
    expect(ctx.destinationKind).toBe('user');
    expect(ctx.hostUser.id).toBe(host.id);
    expect(ctx.agency?.id).toBe(agency.id);
  });

  it('independent host → user destination, no agency', async () => {
    const host = await createTestUser({ role: 'host', hostType: 'independent' });
    const ctx = await resolveGiftRecipient({ recipientId: host.id });
    expect(ctx.destinationKind).toBe('user');
    expect(ctx.agency).toBeNull();
  });

  it('agent-role user with owned agency → REWRITES to agency destination', async () => {
    const agent = await createTestUser({ role: 'agent' });
    const agency = await createTestAgency({ ownerId: agent.id });

    const ctx = await resolveGiftRecipient({ recipientId: agent.id });
    expect(ctx.destinationKind).toBe('agency');
    expect(ctx.agency?.id).toBe(agency.id);
    expect(ctx.hostUser.id).toBe(agent.id);
    expect(ctx.giftTransaction.recipientType).toBe('agency');
    expect(ctx.giftTransaction.recipientAgencyId).toBe(agency.id);
  });

  it('agent-role user with no agency → falls through to user destination', async () => {
    const agent = await createTestUser({ role: 'agent' });
    const ctx = await resolveGiftRecipient({ recipientId: agent.id });
    expect(ctx.destinationKind).toBe('user');
    expect(ctx.agency).toBeNull();
  });

  it('recipientAgencyId → agency destination (owner is host)', async () => {
    const agent = await createTestUser({ role: 'agent' });
    const agency = await createTestAgency({ ownerId: agent.id });

    const ctx = await resolveGiftRecipient({ recipientAgencyId: agency.id });
    expect(ctx.destinationKind).toBe('agency');
    expect(ctx.hostUser.id).toBe(agent.id);
    expect(ctx.giftTransaction.recipientId).toBe(agent.id);
    expect(ctx.giftTransaction.recipientAgencyId).toBe(agency.id);
  });

  it('400s when target agency is suspended', async () => {
    const agent = await createTestUser({ role: 'agent' });
    const agency = await createTestAgency({ ownerId: agent.id, status: 'suspended' });
    await expect(resolveGiftRecipient({ recipientAgencyId: agency.id }))
      .rejects.toThrow(/not active/i);
  });

  it('404s when user missing', async () => {
    await expect(resolveGiftRecipient({ recipientId: '00000000-0000-4000-8000-00000000dead' }))
      .rejects.toThrow(/not found/i);
  });
});

describe('resolveGiftRecipient — coinSeller field', () => {
  it('agent-host with agent who has a CoinSellerProfile → coinSeller populated', async () => {
    const agent = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: agent.id });
    await createTestCoinSellerProfile({
      userId: agent.id,
      giftCommissionRate: 0.05,
      incomeRewardRate: 0.02,
      giftBonusRate: 0.03,
    });
    const host = await createTestUser({ role: 'host', hostType: 'agent_host', agentId: agent.id });

    const ctx = await resolveGiftRecipient({ recipientId: host.id });
    expect(ctx.coinSeller).not.toBeNull();
    expect(ctx.coinSeller!.userId).toBe(agent.id);
    expect(ctx.coinSeller!.giftCommissionRate).toBeCloseTo(0.05);
    expect(ctx.coinSeller!.incomeRewardRate).toBeCloseTo(0.02);
    expect(ctx.coinSeller!.giftBonusRate).toBeCloseTo(0.03);
  });

  it('agent-host with agent who has NO CoinSellerProfile → coinSeller is null', async () => {
    const agent = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: agent.id });
    const host = await createTestUser({ role: 'host', hostType: 'agent_host', agentId: agent.id });

    const ctx = await resolveGiftRecipient({ recipientId: host.id });
    expect(ctx.coinSeller).toBeNull();
  });

  it('recipientAgencyId path: agency owner with CoinSellerProfile → coinSeller populated', async () => {
    const agent = await createTestUser({ role: 'agent' });
    const agency = await createTestAgency({ ownerId: agent.id });
    await createTestCoinSellerProfile({ userId: agent.id, giftCommissionRate: 0.1 });

    const ctx = await resolveGiftRecipient({ recipientAgencyId: agency.id });
    expect(ctx.coinSeller).not.toBeNull();
    expect(ctx.coinSeller!.userId).toBe(agent.id);
    expect(ctx.coinSeller!.giftCommissionRate).toBeCloseTo(0.1);
  });

  it('agent-going-live rewrite: agent-role user with CoinSellerProfile → coinSeller populated', async () => {
    const agent = await createTestUser({ role: 'agent' });
    await createTestAgency({ ownerId: agent.id });
    await createTestCoinSellerProfile({ userId: agent.id, giftCommissionRate: 0.08 });

    const ctx = await resolveGiftRecipient({ recipientId: agent.id });
    expect(ctx.destinationKind).toBe('agency');
    expect(ctx.coinSeller).not.toBeNull();
    expect(ctx.coinSeller!.giftCommissionRate).toBeCloseTo(0.08);
  });

  it('independent host → coinSeller is null', async () => {
    const host = await createTestUser({ role: 'host', hostType: 'independent' });
    const ctx = await resolveGiftRecipient({ recipientId: host.id });
    expect(ctx.coinSeller).toBeNull();
  });
});
