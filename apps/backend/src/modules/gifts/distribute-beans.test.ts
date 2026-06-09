import request from "supertest";
import app from "../../app";
import { prisma } from "../../config/prisma";
import {
  resetDb,
  createTestUser,
  createTestAgency,
  createTestCoinSellerProfile,
  mintJwt,
  getWalletBalance,
  getLedgerRows,
  getAgencyCounters,
  seedRollingAgencyHostBeansSum,
  seedRollingAgencyTurnoverCoinsSum,
  setGiftBonusFallbackRate,
} from "../../tests/db-helpers";
import { clearGiftBonusTierCache } from "./gift-bonus-tier-lookup";

async function getCrownGift(): Promise<{
  id: string;
  coinCost: number;
  beanValue: number;
}> {
  const g = await prisma.gift.findFirstOrThrow({ where: { name: "Crown" } });
  return { id: g.id, coinCost: g.coinCost, beanValue: g.beanValue };
}

const QTY = 100;

async function sendCrownsToUser(senderId: string, recipientId: string) {
  const crown = await getCrownGift();
  return request(app)
    .post("/api/v1/gifts/send")
    .set("Authorization", `Bearer ${mintJwt(senderId)}`)
    .send({ giftId: crown.id, recipientId, qty: QTY });
}

async function sendCrownsToAgency(senderId: string, agencyId: string) {
  const crown = await getCrownGift();
  return request(app)
    .post("/api/v1/gifts/send")
    .set("Authorization", `Bearer ${mintJwt(senderId)}`)
    .send({ giftId: crown.id, recipientAgencyId: agencyId, qty: QTY });
}

beforeEach(async () => {
  await resetDb();
  // Tier ladder lives in DB for prod; tests without tiers fall back to singleton GiftBonusSetting.bonusRate.
  await prisma.giftBonusTier.deleteMany({});
  clearGiftBonusTierCache();
});

/** Restores default seed rows so later suites in the same Jest run (e.g. commission-config) still see tiers. */
afterAll(async () => {
  await prisma.giftBonusTier.deleteMany({});
  await prisma.giftBonusTier.createMany({
    data: [
      { name: "Tier1", minRollingIncome: 0n, bonusRate: 0, order: 0 },
      { name: "Tier2", minRollingIncome: 200_000n, bonusRate: 0.05, order: 1 },
      { name: "Tier3", minRollingIncome: 300_000n, bonusRate: 0.1, order: 2 },
      { name: "Tier4", minRollingIncome: 500_000n, bonusRate: 0.15, order: 3 },
    ],
  });
  clearGiftBonusTierCache();
});

describe("distributeBeans — independent host (no agency)", () => {
  it("host gets 70,000, no agency commission, company_share ledger row only", async () => {
    const sender = await createTestUser({ coinBalance: 200_000 });
    const host = await createTestUser({
      role: "host",
      hostType: "independent",
    });

    const res = await sendCrownsToUser(sender.id, host.id);
    expect(res.status).toBe(201);

    expect(await getWalletBalance(host.id)).toEqual({
      coins: 0,
      beans: 70_000,
    });
    const ledger = await getLedgerRows(res.body.data.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].commissionType).toBe("company_share");
    expect(
      BigInt(ledger[0].amount as unknown as string | number | bigint),
    ).toBe(30_000n);
    expect(ledger[0].agencyId).toBeNull();
    expect(ledger[0].userId).toBeNull();
  });
});

describe("distributeBeans — user destination with agency (direct commission by tier)", () => {
  beforeEach(async () => {
    await setGiftBonusFallbackRate(0);
  });

  it.each([
    { tier: "A", rollingPre: 0n, expectedCommission: 2_800 },
    { tier: "B", rollingPre: 2_000_000n, expectedCommission: 5_600 },
    { tier: "C", rollingPre: 10_000_000n, expectedCommission: 8_400 },
    { tier: "D", rollingPre: 50_000_000n, expectedCommission: 11_200 },
    { tier: "E", rollingPre: 150_000_000n, expectedCommission: 14_000 },
  ])(
    "host at tier $tier → $expectedCommission direct commission on 100k",
    async ({ rollingPre, expectedCommission }) => {
      const sender = await createTestUser({ coinBalance: 200_000 });
      const filler = await createTestUser({ coinBalance: 1 });
      const agent = await createTestUser({ role: "agent" });
      const agency = await createTestAgency({ ownerId: agent.id });
      const host = await createTestUser({
        role: "host",
        hostType: "agent_host",
        agentId: agent.id,
      });
      const crown = await getCrownGift();
      if (rollingPre > 0n) {
        await seedRollingAgencyTurnoverCoinsSum({
          senderId: filler.id,
          giftId: crown.id,
          targetTurnoverCoins: rollingPre,
          recipient: { kind: "host", recipientId: host.id },
        });
      }

      const res = await sendCrownsToUser(sender.id, host.id);
      expect(res.status).toBe(201);

      expect(await getWalletBalance(host.id)).toEqual({
        coins: 0,
        beans: 70_000,
      });
      expect(await getWalletBalance(agent.id)).toEqual({
        coins: 0,
        beans: expectedCommission,
      });

      const ledger = await getLedgerRows(res.body.data.id);
      expect(ledger).toHaveLength(2);
      const directRow = ledger.find((l) => l.commissionType === "direct")!;
      expect(directRow).toBeTruthy();
      expect(
        BigInt(directRow.amount as unknown as string | number | bigint),
      ).toBe(BigInt(expectedCommission));
      expect(directRow.userId).toBe(agent.id);
      expect(directRow.agencyId).toBe(agency.id);
      const companyRow = ledger.find(
        (l) => l.commissionType === "company_share",
      )!;
      expect(companyRow).toBeTruthy();
      expect(companyRow.agencyId).toBeNull();

      const counters = await getAgencyCounters(agency.id);
      expect(counters.cumulativeHostIncome).toBe(70_000n);
    },
  );

  it("turnover gifts before agency createdAt do not affect commission tier", async () => {
    const sender = await createTestUser({ coinBalance: 200_000 });
    const filler = await createTestUser({ coinBalance: 1 });
    const agent = await createTestUser({ role: "agent" });
    const agency = await createTestAgency({ ownerId: agent.id });
    const host = await createTestUser({
      role: "host",
      hostType: "agent_host",
      agentId: agent.id,
    });
    const crown = await getCrownGift();

    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await prisma.$executeRaw`
      UPDATE agencies SET "createdAt" = ${tenDaysAgo}, "updatedAt" = ${tenDaysAgo}
      WHERE id = ${agency.id}
    `;

    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    await seedRollingAgencyTurnoverCoinsSum({
      senderId: filler.id,
      giftId: crown.id,
      targetTurnoverCoins: 2_000_000n,
      createdAt: twentyDaysAgo,
      recipient: { kind: "host", recipientId: host.id },
    });

    const res = await sendCrownsToUser(sender.id, host.id);
    expect(res.status).toBe(201);
    expect(await getWalletBalance(agent.id)).toEqual({
      coins: 0,
      beans: 2_800,
    });
  });

  it("mature agency: turnover outside last 30 days is ignored for tier", async () => {
    const sender = await createTestUser({ coinBalance: 200_000 });
    const filler = await createTestUser({ coinBalance: 1 });
    const agent = await createTestUser({ role: "agent" });
    const agency = await createTestAgency({ ownerId: agent.id });
    const host = await createTestUser({
      role: "host",
      hostType: "agent_host",
      agentId: agent.id,
    });
    const crown = await getCrownGift();

    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await prisma.$executeRaw`
      UPDATE agencies SET "createdAt" = ${fortyDaysAgo}, "updatedAt" = ${fortyDaysAgo}
      WHERE id = ${agency.id}
    `;

    const thirtyTwoDaysAgo = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000);
    await seedRollingAgencyTurnoverCoinsSum({
      senderId: filler.id,
      giftId: crown.id,
      targetTurnoverCoins: 5_000_000n,
      createdAt: thirtyTwoDaysAgo,
      recipient: { kind: "host", recipientId: host.id },
    });

    const res = await sendCrownsToUser(sender.id, host.id);
    expect(res.status).toBe(201);
    expect(await getWalletBalance(agent.id)).toEqual({
      coins: 0,
      beans: 2_800,
    });
  });

  it("single gift crosses 30d slab → higher tier applies on that gift (PRE + hostBeans)", async () => {
    const sender = await createTestUser({ coinBalance: 200_000 });
    const filler = await createTestUser({ coinBalance: 1 });
    const agent = await createTestUser({ role: "agent" });
    const agency = await createTestAgency({ ownerId: agent.id });
    const host = await createTestUser({
      role: "host",
      hostType: "agent_host",
      agentId: agent.id,
    });
    const crown = await getCrownGift();
    await seedRollingAgencyTurnoverCoinsSum({
      senderId: filler.id,
      giftId: crown.id,
      targetTurnoverCoins: 1_930_000n,
      recipient: { kind: "host", recipientId: host.id },
    });

    const res = await sendCrownsToUser(sender.id, host.id);
    expect(res.status).toBe(201);

    expect((await getWalletBalance(agent.id)).beans).toBe(5_600);
    const direct = (await getLedgerRows(res.body.data.id)).find(
      (l) => l.commissionType === "direct",
    )!;
    expect(BigInt(direct.amount as unknown as string | number | bigint)).toBe(
      5_600n,
    );
    expect(Number(direct.rateApplied)).toBeCloseTo(0.08);
  });

  it("agency override of 0.25 ignores tier", async () => {
    const sender = await createTestUser({ coinBalance: 200_000 });
    const agent = await createTestUser({ role: "agent" });
    const agency = await createTestAgency({
      ownerId: agent.id,
      commissionRateOverride: 0.25,
    });
    const host = await createTestUser({
      role: "host",
      hostType: "agent_host",
      agentId: agent.id,
    });

    const res = await sendCrownsToUser(sender.id, host.id);
    expect(res.status).toBe(201);

    expect((await getWalletBalance(agent.id)).beans).toBe(17_500);
    const ledger = await getLedgerRows(res.body.data.id);
    const directRow = ledger.find((l) => l.commissionType === "direct")!;
    expect(Number(directRow.rateApplied)).toBeCloseTo(0.25);
  });

  it("commission override after validUntil uses tier rate", async () => {
    const sender = await createTestUser({ coinBalance: 200_000 });
    const agent = await createTestUser({ role: "agent" });
    const expired = new Date(Date.now() - 86_400_000);
    await createTestAgency({
      ownerId: agent.id,
      commissionRateOverride: 0.25,
      commissionRateOverrideValidUntil: expired,
    });
    const host = await createTestUser({
      role: "host",
      hostType: "agent_host",
      agentId: agent.id,
    });

    const res = await sendCrownsToUser(sender.id, host.id);
    expect(res.status).toBe(201);

    expect((await getWalletBalance(agent.id)).beans).toBe(2_800);
    const directRow = (await getLedgerRows(res.body.data.id)).find(
      (l) => l.commissionType === "direct",
    )!;
    expect(Number(directRow.rateApplied)).toBeCloseTo(0.04);
  });
});

describe("distributeBeans — parent delta", () => {
  async function makeChain(opts: {
    /** Rolling 30d hostBeans sum attributed to sub agency before the test gift */
    subRollingPre: bigint;
    /** Rolling 30d hostBeans sum attributed to parent agency (parent’s own hosts/agency only) */
    parentRollingPre: bigint;
    parentStatus?: "active" | "suspended";
  }) {
    const sender = await createTestUser({ coinBalance: 200_000 });
    const filler = await createTestUser({ coinBalance: 1 });
    const parentAgent = await createTestUser({ role: "agent" });
    const subAgent = await createTestUser({ role: "agent" });
    const parentAgency = await createTestAgency({ ownerId: parentAgent.id });
    const subAgency = await createTestAgency({
      ownerId: subAgent.id,
      parentAgencyId: parentAgency.id,
      status: "active",
    });
    const host = await createTestUser({
      role: "host",
      hostType: "agent_host",
      agentId: subAgent.id,
    });
    const parentHost = await createTestUser({
      role: "host",
      hostType: "agent_host",
      agentId: parentAgent.id,
    });

    const crown = await getCrownGift();
    if (opts.subRollingPre > 0n) {
      await seedRollingAgencyTurnoverCoinsSum({
        senderId: filler.id,
        giftId: crown.id,
        targetTurnoverCoins: opts.subRollingPre,
        recipient: { kind: "host", recipientId: host.id },
      });
    }
    if (opts.parentRollingPre > 0n) {
      await seedRollingAgencyTurnoverCoinsSum({
        senderId: filler.id,
        giftId: crown.id,
        targetTurnoverCoins: opts.parentRollingPre,
        recipient: { kind: "host", recipientId: parentHost.id },
      });
    }

    if (opts.parentStatus === "suspended") {
      await prisma.agency.update({
        where: { id: parentAgency.id },
        data: { status: "suspended" },
      });
    }

    return {
      sender,
      parentAgent,
      subAgent,
      parentAgency,
      subAgency,
      host,
      filler,
    };
  }

  it("parent at E (20%), sub at D (16%) → parent delta = 2,800", async () => {
    const { sender, parentAgent, subAgent, subAgency, parentAgency, host } =
      await makeChain({
        subRollingPre: 50_000_000n,
        parentRollingPre: 150_000_000n,
      });

    const res = await sendCrownsToUser(sender.id, host.id);
    expect(res.status).toBe(201);

    expect((await getWalletBalance(host.id)).beans).toBe(70_000);
    expect((await getWalletBalance(subAgent.id)).beans).toBe(11_200);
    expect((await getWalletBalance(parentAgent.id)).beans).toBe(2_800);

    const ledger = await getLedgerRows(res.body.data.id);
    const direct = ledger.find((l) => l.commissionType === "direct");
    const parent = ledger.find((l) => l.commissionType === "parent_delta");
    expect(direct).toBeTruthy();
    expect(BigInt(direct!.amount as unknown as string | number | bigint)).toBe(
      11_200n,
    );
    expect(parent).toBeTruthy();
    expect(BigInt(parent!.amount as unknown as string | number | bigint)).toBe(
      2_800n,
    );
    expect(Number(parent!.rateApplied)).toBeCloseTo(0.04);
    expect(parent!.userId).toBe(parentAgent.id);
    expect(parent!.agencyId).toBe(parentAgency.id);

    const subC = await getAgencyCounters(subAgency.id);
    const parentC = await getAgencyCounters(parentAgency.id);
    // Seeded synthetic txs do not bump cumulative counters; only the live gift does.
    expect(subC.cumulativeHostIncome).toBe(70_000n);
    expect(parentC.cumulativeHostIncome).toBe(70_000n);
  });

  it("parent equals sub (both E) → parent delta = 0, no parent ledger row", async () => {
    const { sender, parentAgent, host } = await makeChain({
      subRollingPre: 150_000_000n,
      parentRollingPre: 150_000_000n,
    });
    const res = await sendCrownsToUser(sender.id, host.id);
    expect(res.status).toBe(201);
    expect((await getWalletBalance(parentAgent.id)).beans).toBe(0);
    const ledger = await getLedgerRows(res.body.data.id);
    expect(ledger.some((l) => l.commissionType === "parent_delta")).toBe(false);
  });

  it("sub higher than parent → parent delta clamps to 0", async () => {
    const { sender, parentAgent, host } = await makeChain({
      subRollingPre: 150_000_000n,
      parentRollingPre: 50_000_000n,
    });
    const res = await sendCrownsToUser(sender.id, host.id);
    expect(res.status).toBe(201);
    expect((await getWalletBalance(parentAgent.id)).beans).toBe(0);
    const ledger = await getLedgerRows(res.body.data.id);
    expect(ledger.some((l) => l.commissionType === "parent_delta")).toBe(false);
  });

  it("parent suspended → delta skipped (but counters still bump)", async () => {
    const { sender, parentAgent, parentAgency, host } = await makeChain({
      subRollingPre: 50_000_000n,
      parentRollingPre: 150_000_000n,
      parentStatus: "suspended",
    });
    const res = await sendCrownsToUser(sender.id, host.id);
    expect(res.status).toBe(201);
    expect((await getWalletBalance(parentAgent.id)).beans).toBe(0);
    const ledger = await getLedgerRows(res.body.data.id);
    expect(ledger.some((l) => l.commissionType === "parent_delta")).toBe(false);
    const parentC = await getAgencyCounters(parentAgency.id);
    expect(parentC.cumulativeHostIncome).toBe(70_000n);
  });

  it("parent commission tier includes sub-agency host turnover (rollup)", async () => {
    const sender = await createTestUser({ coinBalance: 200_000 });
    const filler = await createTestUser({ coinBalance: 1 });
    const parentAgent = await createTestUser({ role: "agent" });
    const subAgent = await createTestUser({ role: "agent" });
    const parentAgency = await createTestAgency({ ownerId: parentAgent.id });
    const subAgency = await createTestAgency({
      ownerId: subAgent.id,
      parentAgencyId: parentAgency.id,
      status: "active",
    });
    const parentHost = await createTestUser({
      role: "host",
      hostType: "agent_host",
      agentId: parentAgent.id,
    });
    const subHost = await createTestUser({
      role: "host",
      hostType: "agent_host",
      agentId: subAgent.id,
    });
    const crown = await getCrownGift();

    await seedRollingAgencyTurnoverCoinsSum({
      senderId: filler.id,
      giftId: crown.id,
      targetTurnoverCoins: 100_000_000n,
      recipient: { kind: "host", recipientId: parentHost.id },
    });
    await seedRollingAgencyTurnoverCoinsSum({
      senderId: filler.id,
      giftId: crown.id,
      targetTurnoverCoins: 50_000_000n,
      recipient: { kind: "host", recipientId: subHost.id },
    });

    const res = await sendCrownsToUser(sender.id, subHost.id);
    expect(res.status).toBe(201);

    expect((await getWalletBalance(subHost.id)).beans).toBe(70_000);
    expect((await getWalletBalance(subAgent.id)).beans).toBe(11_200);
    expect((await getWalletBalance(parentAgent.id)).beans).toBe(2_800);

    const ledger = await getLedgerRows(res.body.data.id);
    const parentRow = ledger.find((l) => l.commissionType === "parent_delta");
    expect(parentRow).toBeTruthy();
    expect(
      BigInt(parentRow!.amount as unknown as string | number | bigint),
    ).toBe(2_800n);
  });
});

describe("distributeBeans — 30-day rolling commission tier decay", () => {
  it("ignores gift turnover older than 30 days for commission tier", async () => {
    const sender = await createTestUser({ coinBalance: 200_000 });
    const filler = await createTestUser({ coinBalance: 1 });
    const agent = await createTestUser({ role: "agent" });
    await createTestAgency({ ownerId: agent.id });
    const host = await createTestUser({
      role: "host",
      hostType: "agent_host",
      agentId: agent.id,
    });
    const crown = await getCrownGift();

    const stale = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
    await seedRollingAgencyTurnoverCoinsSum({
      senderId: filler.id,
      giftId: crown.id,
      targetTurnoverCoins: 10_000_000n,
      createdAt: stale,
      recipient: { kind: "host", recipientId: host.id },
    });

    const res = await sendCrownsToUser(sender.id, host.id);
    expect(res.status).toBe(201);
    expect((await getWalletBalance(agent.id)).beans).toBe(2_800);
    const direct = (await getLedgerRows(res.body.data.id)).find(
      (l) => l.commissionType === "direct",
    );
    expect(Number(direct?.rateApplied)).toBeCloseTo(0.04);
  });
});

describe("distributeBeans — agency destination gift bonus", () => {
  it("agency destination + bonus enabled at 0.15 → 10,500 to Agency.beanBalance + ledger", async () => {
    await setGiftBonusFallbackRate(0.15);

    const sender = await createTestUser({ coinBalance: 200_000 });
    const filler = await createTestUser({ coinBalance: 1 });
    const agent = await createTestUser({ role: "agent" });
    const agency = await createTestAgency({ ownerId: agent.id });
    const crown = await getCrownGift();
    await seedRollingAgencyHostBeansSum({
      senderId: filler.id,
      giftId: crown.id,
      targetHostBeans: 150_000_000n,
      recipient: {
        kind: "agency",
        recipientId: agent.id,
        recipientAgencyId: agency.id,
      },
    });

    const res = await sendCrownsToAgency(sender.id, agency.id);
    expect(res.status).toBe(201);
    expect(res.body.data.recipientType).toBe("agency");
    expect(res.body.data.recipientAgencyId).toBe(agency.id);

    const counters = await getAgencyCounters(agency.id);
    expect(counters.beanBalance).toBe(10_500n);

    const ledger = await getLedgerRows(res.body.data.id);
    const bonus = ledger.find((l) => l.commissionType === "gift_bonus");
    expect(bonus).toBeTruthy();
    expect(BigInt(bonus!.amount as unknown as string | number | bigint)).toBe(
      10_500n,
    );
    expect(bonus!.userId).toBeNull();
    expect(bonus!.agencyId).toBe(agency.id);
    expect(Number(bonus!.rateApplied)).toBeCloseTo(0.15);

    expect((await getWalletBalance(agent.id)).beans).toBe(
      70_000 + 14_000 + 10_500,
    );
  });

  it("per-agency disabled → no bonus credit even with global on and fallback rate", async () => {
    await setGiftBonusFallbackRate(0.15);
    await prisma.giftBonusSetting.update({
      where: { id: "singleton" },
      data: { enabled: true },
    });

    const sender = await createTestUser({ coinBalance: 200_000 });
    const agent = await createTestUser({ role: "agent" });
    const agency = await createTestAgency({
      ownerId: agent.id,
      giftBonusEnabled: false,
    });

    const res = await sendCrownsToAgency(sender.id, agency.id);
    expect(res.status).toBe(201);
    const ledger = await getLedgerRows(res.body.data.id);
    expect(ledger.some((l) => l.commissionType === "gift_bonus")).toBe(false);
    const direct = ledger.find((l) => l.commissionType === "direct");
    expect(direct).toBeTruthy();
  });

  it("globally disabled → no bonus credit even with fallback rate", async () => {
    await setGiftBonusFallbackRate(0.15);
    await prisma.giftBonusSetting.update({
      where: { id: "singleton" },
      data: { enabled: false },
    });

    const sender = await createTestUser({ coinBalance: 200_000 });
    const agent = await createTestUser({ role: "agent" });
    const agency = await createTestAgency({ ownerId: agent.id });

    const res = await sendCrownsToAgency(sender.id, agency.id);
    expect(res.status).toBe(201);
    const counters = await getAgencyCounters(agency.id);
    expect(counters.beanBalance).toBe(0n);
    const ledger = await getLedgerRows(res.body.data.id);
    expect(ledger.some((l) => l.commissionType === "gift_bonus")).toBe(false);
  });

  it("fallback rate 0 with no tiers → no bonus credit, no gift_bonus ledger", async () => {
    await setGiftBonusFallbackRate(0);
    const sender = await createTestUser({ coinBalance: 200_000 });
    const agent = await createTestUser({ role: "agent" });
    const agency = await createTestAgency({ ownerId: agent.id });

    const res = await sendCrownsToAgency(sender.id, agency.id);
    expect(res.status).toBe(201);
    const counters = await getAgencyCounters(agency.id);
    expect(counters.beanBalance).toBe(0n);
    const ledger = await getLedgerRows(res.body.data.id);
    expect(ledger.some((l) => l.commissionType === "gift_bonus")).toBe(false);
  });

  it("user destination host gift + bonus enabled → direct commission only, no gift bonus", async () => {
    await setGiftBonusFallbackRate(0.15);
    const sender = await createTestUser({ coinBalance: 200_000 });
    const filler = await createTestUser({ coinBalance: 1 });
    const agent = await createTestUser({ role: "agent" });
    const agency = await createTestAgency({ ownerId: agent.id });
    const host = await createTestUser({
      role: "host",
      hostType: "agent_host",
      agentId: agent.id,
    });
    const crown = await getCrownGift();
    await seedRollingAgencyTurnoverCoinsSum({
      senderId: filler.id,
      giftId: crown.id,
      targetTurnoverCoins: 150_000_000n,
      recipient: { kind: "host", recipientId: host.id },
    });

    const res = await sendCrownsToUser(sender.id, host.id);
    expect(res.status).toBe(201);
    expect(res.body.data.recipientType).toBe("user");
    expect(res.body.data.recipientAgencyId).toBeNull();

    expect(await getWalletBalance(host.id)).toEqual({ coins: 0, beans: 70_000 });
    expect(await getWalletBalance(agent.id)).toEqual({ coins: 0, beans: 14_000 });

    const counters = await getAgencyCounters(agency.id);
    expect(counters.beanBalance).toBe(0n);

    const ledger = await getLedgerRows(res.body.data.id);
    expect(ledger.some((l) => l.commissionType === "gift_bonus")).toBe(false);
    const direct = ledger.find((l) => l.commissionType === "direct");
    expect(direct).toBeTruthy();
    expect(BigInt(direct!.amount as unknown as string | number | bigint)).toBe(
      14_000n,
    );
  });

  it("per-agency bonus rate override", async () => {
    await setGiftBonusFallbackRate(0.15);
    const sender = await createTestUser({ coinBalance: 200_000 });
    const agent = await createTestUser({ role: "agent" });
    const agency = await createTestAgency({
      ownerId: agent.id,
      giftBonusRateOverride: 0.2,
    });

    const res = await sendCrownsToAgency(sender.id, agency.id);
    expect(res.status).toBe(201);
    const counters = await getAgencyCounters(agency.id);
    expect(counters.beanBalance).toBe(14_000n);
    const ledger = await getLedgerRows(res.body.data.id);
    const bonus = ledger.find((l) => l.commissionType === "gift_bonus");
    expect(Number(bonus!.rateApplied)).toBeCloseTo(0.2);
  });

  it("gift bonus override after validUntil uses singleton ladder fallback", async () => {
    await setGiftBonusFallbackRate(0.15);
    const sender = await createTestUser({ coinBalance: 200_000 });
    const agent = await createTestUser({ role: "agent" });
    const expired = new Date(Date.now() - 86_400_000);
    const agency = await createTestAgency({
      ownerId: agent.id,
      giftBonusRateOverride: 0.2,
      giftBonusRateOverrideValidUntil: expired,
    });

    const res = await sendCrownsToAgency(sender.id, agency.id);
    expect(res.status).toBe(201);
    const counters = await getAgencyCounters(agency.id);
    expect(counters.beanBalance).toBe(10_500n);
    const bonus = (await getLedgerRows(res.body.data.id)).find(
      (l) => l.commissionType === "gift_bonus",
    );
    expect(Number(bonus!.rateApplied)).toBeCloseTo(0.15);
  });
});

describe("distributeBeans — rolling gift bonus tiers (seeded ladder)", () => {
  beforeEach(async () => {
    await prisma.giftBonusTier.createMany({
      data: [
        {
          id: "e2e-gbt-1",
          name: "Tier1",
          minRollingIncome: 300000n,
          bonusRate: 0.05,
          order: 0,
        },
        {
          id: "e2e-gbt-2",
          name: "Tier2",
          minRollingIncome: 3000000n,
          bonusRate: 0.1,
          order: 1,
        },
        {
          id: "e2e-gbt-3",
          name: "Tier3",
          minRollingIncome: 10000000n,
          bonusRate: 0.15,
          order: 2,
        },
      ],
    });
    clearGiftBonusTierCache();
  });

  it("applies tier gift bonus when rolling PRE-income reaches first threshold (agency destination)", async () => {
    await setGiftBonusFallbackRate(0.15);
    const crown = await getCrownGift();
    const sender = await createTestUser({ coinBalance: 500_000 });
    const agent = await createTestUser({ role: "agent" });
    const agency = await createTestAgency({ ownerId: agent.id });

    await prisma.giftTransaction.create({
      data: {
        senderId: sender.id,
        recipientId: agent.id,
        recipientType: "agency",
        recipientAgencyId: agency.id,
        giftId: crown.id,
        qty: 1,
        coinCost: crown.coinCost,
        beanValue: 500_000,
        // Must be >= agency.createdAt or rolling sum excludes it (windowStartNotBefore).
        createdAt: new Date(),
      },
    });

    const res = await sendCrownsToAgency(sender.id, agency.id);
    expect(res.status).toBe(201);
    const counters = await getAgencyCounters(agency.id);
    expect(counters.beanBalance).toBe(3_500n);
    const ledger = await getLedgerRows(res.body.data.id);
    const bonus = ledger.find((l) => l.commissionType === "gift_bonus");
    expect(bonus).toBeTruthy();
    expect(Number(bonus!.rateApplied)).toBeCloseTo(0.05);
  });

  it("host gifts count toward gift bonus tier but bonus pays only on agency destination", async () => {
    await setGiftBonusFallbackRate(0.15);
    const crown = await getCrownGift();
    const sender = await createTestUser({ coinBalance: 500_000 });
    const filler = await createTestUser({ coinBalance: 1 });
    const agent = await createTestUser({ role: "agent" });
    const agency = await createTestAgency({ ownerId: agent.id });
    const host = await createTestUser({
      role: "host",
      hostType: "agent_host",
      agentId: agent.id,
    });

    // Prime large rolling volume on host gifts only; counts toward tier, no payout on host path.
    await seedRollingAgencyHostBeansSum({
      senderId: filler.id,
      giftId: crown.id,
      targetHostBeans: 10_000_000n,
      recipient: { kind: "host", recipientId: host.id },
    });

    const hostRes = await sendCrownsToUser(sender.id, host.id);
    expect(hostRes.status).toBe(201);
    expect(
      (await getLedgerRows(hostRes.body.data.id)).some(
        (l) => l.commissionType === "gift_bonus",
      ),
    ).toBe(false);
    expect((await getAgencyCounters(agency.id)).beanBalance).toBe(0n);

    const agencyRes = await sendCrownsToAgency(sender.id, agency.id);
    expect(agencyRes.status).toBe(201);
    expect((await getAgencyCounters(agency.id)).beanBalance).toBe(10_500n);
    const bonus = (await getLedgerRows(agencyRes.body.data.id)).find(
      (l) => l.commissionType === "gift_bonus",
    );
    expect(bonus).toBeTruthy();
    expect(Number(bonus!.rateApplied)).toBeCloseTo(0.15);
  });

  it("combines direct agency gifts and host gifts for gift bonus tier input", async () => {
    await setGiftBonusFallbackRate(0.15);
    const crown = await getCrownGift();
    const sender = await createTestUser({ coinBalance: 500_000 });
    const filler = await createTestUser({ coinBalance: 1 });
    const agent = await createTestUser({ role: "agent" });
    const agency = await createTestAgency({ ownerId: agent.id });
    const host = await createTestUser({
      role: "host",
      hostType: "agent_host",
      agentId: agent.id,
    });

    await seedRollingAgencyHostBeansSum({
      senderId: filler.id,
      giftId: crown.id,
      targetHostBeans: 5_000_000n,
      recipient: {
        kind: "agency",
        recipientId: agent.id,
        recipientAgencyId: agency.id,
      },
    });
    await seedRollingAgencyHostBeansSum({
      senderId: filler.id,
      giftId: crown.id,
      targetHostBeans: 5_000_000n,
      recipient: { kind: "host", recipientId: host.id },
    });

    const res = await sendCrownsToAgency(sender.id, agency.id);
    expect(res.status).toBe(201);

    const counters = await getAgencyCounters(agency.id);
    expect(counters.beanBalance).toBe(10_500n);
    const bonus = (await getLedgerRows(res.body.data.id)).find(
      (l) => l.commissionType === "gift_bonus",
    );
    expect(bonus).toBeTruthy();
    expect(Number(bonus!.rateApplied)).toBeCloseTo(0.15);
  });

  it("host gift income before agency creation does not affect gift bonus tier", async () => {
    await setGiftBonusFallbackRate(0.15);
    const crown = await getCrownGift();
    const sender = await createTestUser({ coinBalance: 500_000 });
    const filler = await createTestUser({ coinBalance: 1 });
    const agent = await createTestUser({ role: "agent" });
    const agency = await createTestAgency({ ownerId: agent.id });
    const host = await createTestUser({
      role: "host",
      hostType: "agent_host",
      agentId: agent.id,
    });

    const agencyCreatedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await prisma.$executeRaw`
      UPDATE agencies SET "createdAt" = ${agencyCreatedAt}, "updatedAt" = ${agencyCreatedAt}
      WHERE id = ${agency.id}
    `;
    await seedRollingAgencyHostBeansSum({
      senderId: filler.id,
      giftId: crown.id,
      targetHostBeans: 10_000_000n,
      createdAt: new Date(agencyCreatedAt.getTime() - 60 * 60 * 1000),
      recipient: { kind: "host", recipientId: host.id },
    });

    const res = await sendCrownsToAgency(sender.id, agency.id);
    expect(res.status).toBe(201);

    const counters = await getAgencyCounters(agency.id);
    expect(counters.beanBalance).toBe(0n);
    const ledger = await getLedgerRows(res.body.data.id);
    expect(ledger.some((l) => l.commissionType === "gift_bonus")).toBe(false);
  });
});

describe("distributeBeans — agent-going-live rewrite", () => {
  it("gift to an agent-role user with an agency is recorded as agency-destination", async () => {
    const sender = await createTestUser({ coinBalance: 200_000 });
    const agent = await createTestUser({ role: "agent" });
    const agency = await createTestAgency({ ownerId: agent.id });

    const res = await sendCrownsToUser(sender.id, agent.id);
    expect(res.status).toBe(201);
    expect(res.body.data.recipientType).toBe("agency");
    expect(res.body.data.recipientAgencyId).toBe(agency.id);
  });

  it("agent with no agency → plain user destination, no agency commission, only company_share", async () => {
    const sender = await createTestUser({ coinBalance: 200_000 });
    const agent = await createTestUser({ role: "agent" });

    const res = await sendCrownsToUser(sender.id, agent.id);
    expect(res.status).toBe(201);
    expect(res.body.data.recipientType).toBe("user");
    expect((await getWalletBalance(agent.id)).beans).toBe(70_000);
    const ledger = await getLedgerRows(res.body.data.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].commissionType).toBe("company_share");
    expect(ledger[0].agencyId).toBeNull();
  });
});

describe("distributeBeans — coin seller additional earnings", () => {
  beforeEach(async () => {
    await setGiftBonusFallbackRate(0);
    // Isolated from seed tier ladder so profile-zero tests see no cs credits.
    await prisma.coinSellerLevelRule.deleteMany({});
  });

  it("agent with CoinSellerProfile (all 3 rates set) → 3 extra credits + 3 ledger rows", async () => {
    const sender = await createTestUser({ coinBalance: 200_000 });
    const agent  = await createTestUser({ role: "agent" });
    await createTestAgency({ ownerId: agent.id });
    await createTestCoinSellerProfile({
      userId: agent.id,
      giftCommissionRate: 0.05,  // 70_000 × 0.05 = 3_500
      incomeRewardRate:   0.02,  // 70_000 × 0.02 = 1_400
      giftBonusRate:      0.03,  // 70_000 × 0.03 = 2_100
    });
    const host = await createTestUser({ role: "host", hostType: "agent_host", agentId: agent.id });

    const res = await sendCrownsToUser(sender.id, host.id);
    expect(res.status).toBe(201);

    // Host still gets 70,000.
    expect(await getWalletBalance(host.id)).toEqual({ coins: 0, beans: 70_000 });

    // Agent gets: directCommission (tier A, 0.04 × 70,000 = 2,800)
    //           + csGiftCommission (3,500) + csIncomeReward (1,400) + csGiftBonus (2,100)
    expect(await getWalletBalance(agent.id)).toEqual({ coins: 0, beans: 9_800 });

    const ledger = await getLedgerRows(res.body.data.id);

    const csGift = ledger.find((l) => l.commissionType === "cs_gift_commission");
    expect(csGift).toBeTruthy();
    expect(BigInt(csGift!.amount as unknown as string | number | bigint)).toBe(3_500n);
    expect(Number(csGift!.rateApplied)).toBeCloseTo(0.05);
    expect(csGift!.userId).toBe(agent.id);
    expect(csGift!.agencyId).toBeNull();

    const csIncome = ledger.find((l) => l.commissionType === "cs_income_reward");
    expect(csIncome).toBeTruthy();
    expect(BigInt(csIncome!.amount as unknown as string | number | bigint)).toBe(1_400n);
    expect(Number(csIncome!.rateApplied)).toBeCloseTo(0.02);
    expect(csIncome!.userId).toBe(agent.id);
    expect(csIncome!.agencyId).toBeNull();

    const csBonus = ledger.find((l) => l.commissionType === "cs_gift_bonus");
    expect(csBonus).toBeTruthy();
    expect(BigInt(csBonus!.amount as unknown as string | number | bigint)).toBe(2_100n);
    expect(Number(csBonus!.rateApplied)).toBeCloseTo(0.03);
    expect(csBonus!.userId).toBe(agent.id);
    expect(csBonus!.agencyId).toBeNull();

    // Company share = 100,000 − 70,000 − 2,800 − 3,500 − 1,400 − 2,100 = 20,200
    const company = ledger.find((l) => l.commissionType === "company_share");
    expect(BigInt(company!.amount as unknown as string | number | bigint)).toBe(20_200n);
  });

  it("agent with CoinSellerProfile but all rates zero → no cs ledger rows, no extra wallet credit", async () => {
    const sender = await createTestUser({ coinBalance: 200_000 });
    const agent  = await createTestUser({ role: "agent" });
    await createTestAgency({ ownerId: agent.id });
    await createTestCoinSellerProfile({
      userId: agent.id,
      giftCommissionRate: 0,
      incomeRewardRate:   0,
      giftBonusRate:      0,
    });
    const host = await createTestUser({ role: "host", hostType: "agent_host", agentId: agent.id });

    const res = await sendCrownsToUser(sender.id, host.id);
    expect(res.status).toBe(201);

    // Agent only gets directCommission (tier A = 2,800). No cs bonus.
    expect((await getWalletBalance(agent.id)).beans).toBe(2_800);

    const ledger = await getLedgerRows(res.body.data.id);
    expect(ledger.some((l) => l.commissionType === "cs_gift_commission")).toBe(false);
    expect(ledger.some((l) => l.commissionType === "cs_income_reward")).toBe(false);
    expect(ledger.some((l) => l.commissionType === "cs_gift_bonus")).toBe(false);
    expect(ledger.some((l) => l.commissionType === "cs_total_commission")).toBe(false);

    // Company share unchanged from no-cs scenario: 100,000 − 70,000 − 2,800 = 27,200
    const company = ledger.find((l) => l.commissionType === "company_share");
    expect(BigInt(company!.amount as unknown as string | number | bigint)).toBe(27_200n);
  });

  it("independent host (no agent) → no cs credits", async () => {
    const sender = await createTestUser({ coinBalance: 200_000 });
    const host   = await createTestUser({ role: "host", hostType: "independent" });

    const res = await sendCrownsToUser(sender.id, host.id);
    expect(res.status).toBe(201);

    const ledger = await getLedgerRows(res.body.data.id);
    expect(ledger.some((l) => l.commissionType.startsWith("cs_"))).toBe(false);
    expect(ledger).toHaveLength(1); // only company_share
  });

  it("existing tests unaffected: agent WITHOUT CoinSellerProfile → no cs credits", async () => {
    const sender = await createTestUser({ coinBalance: 200_000 });
    const agent  = await createTestUser({ role: "agent" });
    await createTestAgency({ ownerId: agent.id });
    const host = await createTestUser({ role: "host", hostType: "agent_host", agentId: agent.id });

    const res = await sendCrownsToUser(sender.id, host.id);
    expect(res.status).toBe(201);

    expect((await getWalletBalance(agent.id)).beans).toBe(2_800);
    const ledger = await getLedgerRows(res.body.data.id);
    expect(ledger.some((l) => l.commissionType.startsWith("cs_"))).toBe(false);
    expect(ledger).toHaveLength(2); // direct + company_share
  });

  it("totalCommissionRate only → cs_total_commission ledger + wallet credit", async () => {
    const sender = await createTestUser({ coinBalance: 200_000 });
    const agent  = await createTestUser({ role: "agent" });
    await createTestAgency({ ownerId: agent.id });
    await createTestCoinSellerProfile({
      userId: agent.id,
      totalCommissionRate: 0.04, // 70_000 × 0.04 = 2_800
    });
    const host = await createTestUser({ role: "host", hostType: "agent_host", agentId: agent.id });

    const res = await sendCrownsToUser(sender.id, host.id);
    expect(res.status).toBe(201);

    // direct 2,800 + cs total 2,800
    expect((await getWalletBalance(agent.id)).beans).toBe(5_600);

    const ledger = await getLedgerRows(res.body.data.id);
    const csTotal = ledger.find((l) => l.commissionType === "cs_total_commission");
    expect(csTotal).toBeTruthy();
    expect(BigInt(csTotal!.amount as unknown as string | number | bigint)).toBe(2_800n);
    expect(Number(csTotal!.rateApplied)).toBeCloseTo(0.04);
    expect(csTotal!.userId).toBe(agent.id);

    const company = ledger.find((l) => l.commissionType === "company_share");
    // 100_000 − 70_000 − 2_800 − 2_800 = 24_400
    expect(BigInt(company!.amount as unknown as string | number | bigint)).toBe(24_400n);
  });

  it("profile rates zero → tier ladder rates applied on gift", async () => {
    const sender = await createTestUser({ coinBalance: 200_000 });
    const agent  = await createTestUser({ role: "agent" });
    await createTestAgency({ ownerId: agent.id });
    await createTestCoinSellerProfile({ userId: agent.id });
    await prisma.coinSellerLevelRule.create({
      data: {
        levelName: `tier_ladder_${agent.id.slice(0, 8)}`,
        minRollingCoins: 0,
        totalCommissionRate: 0.04,
        giftCommissionRate: 0.06,
        incomeRewardRate: 0.02,
        giftBonusRate: 0.03,
        sortOrder: 99,
      },
    });
    const host = await createTestUser({ role: "host", hostType: "agent_host", agentId: agent.id });

    const res = await sendCrownsToUser(sender.id, host.id);
    expect(res.status).toBe(201);

    const ledger = await getLedgerRows(res.body.data.id);
    const csGift = ledger.find((l) => l.commissionType === "cs_gift_commission");
    expect(csGift).toBeTruthy();
    expect(BigInt(csGift!.amount as unknown as string | number | bigint)).toBe(4_200n);
    expect(Number(csGift!.rateApplied)).toBeCloseTo(0.06);

    const csTotal = ledger.find((l) => l.commissionType === "cs_total_commission");
    expect(BigInt(csTotal!.amount as unknown as string | number | bigint)).toBe(2_800n);

    // direct 2_800 + cs total 2_800 + gift 4_200 + income 1_400 + bonus 2_100 = 13_300
    expect((await getWalletBalance(agent.id)).beans).toBe(13_300);
  });

  it("non-zero profile rate overrides tier ladder on gift", async () => {
    const sender = await createTestUser({ coinBalance: 200_000 });
    const agent  = await createTestUser({ role: "agent" });
    await createTestAgency({ ownerId: agent.id });
    await createTestCoinSellerProfile({
      userId: agent.id,
      giftCommissionRate: 0.05,
    });
    await prisma.coinSellerLevelRule.create({
      data: {
        levelName: `tier_override_${agent.id.slice(0, 8)}`,
        minRollingCoins: 0,
        giftCommissionRate: 0.1,
        sortOrder: 99,
      },
    });
    const host = await createTestUser({ role: "host", hostType: "agent_host", agentId: agent.id });

    const res = await sendCrownsToUser(sender.id, host.id);
    expect(res.status).toBe(201);

    const ledger = await getLedgerRows(res.body.data.id);
    const csGift = ledger.find((l) => l.commissionType === "cs_gift_commission");
    expect(BigInt(csGift!.amount as unknown as string | number | bigint)).toBe(3_500n);
    expect(Number(csGift!.rateApplied)).toBeCloseTo(0.05);
  });
});
