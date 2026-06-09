/**
 * Feature 7 — Gift System (integration)
 * Exercises GET /gifts, POST /gifts/send through the real stack.
 */
import request from "supertest";
import app from "../../app";
import {
  resetDb,
  createTestUser,
  createTestAgency,
  mintJwt,
  getWalletBalance,
} from "../../tests/db-helpers";
import { prisma } from "../../config/prisma";
import { sendGift } from "./gifts.service";

beforeEach(async () => {
  await resetDb();
});

async function crown() {
  return prisma.gift.findFirstOrThrow({ where: { name: "Crown" } });
}

describe("GET /api/v1/gifts", () => {
  it("returns the active catalogue", async () => {
    const sender = await createTestUser();
    const res = await request(app)
      .get("/api/v1/gifts")
      .set("Authorization", `Bearer ${mintJwt(sender.id)}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty("name");
    expect(res.body.data[0]).toHaveProperty("coinCost");
  });

  it("returns 401 without token", async () => {
    const res = await request(app).get("/api/v1/gifts");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/gifts/received/:userId", () => {
  it("returns aggregated qty per gift type", async () => {
    const sender = await createTestUser({ coinBalance: 50_000 });
    const recipient = await createTestUser();
    const g = await crown();

    await request(app)
      .post("/api/v1/gifts/send")
      .set("Authorization", `Bearer ${mintJwt(sender.id)}`)
      .send({ giftId: g.id, recipientId: recipient.id, qty: 2 });

    await request(app)
      .post("/api/v1/gifts/send")
      .set("Authorization", `Bearer ${mintJwt(sender.id)}`)
      .send({ giftId: g.id, recipientId: recipient.id, qty: 1 });

    const res = await request(app)
      .get(`/api/v1/gifts/received/${recipient.id}`)
      .set("Authorization", `Bearer ${mintJwt(sender.id)}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(g.id);
    expect(res.body.data[0].qty).toBe(3);
    expect(res.body.data[0]).toHaveProperty("name", g.name);
    expect(res.body.data[0]).toHaveProperty("receivedAt");
  });
});

describe("POST /api/v1/gifts/send", () => {
  it("sends a gift to a normal user (2-way split: host 70%, company 30%)", async () => {
    const sender = await createTestUser({ coinBalance: 5_000 });
    const recipient = await createTestUser();
    const g = await crown();

    const res = await request(app)
      .post("/api/v1/gifts/send")
      .set("Authorization", `Bearer ${mintJwt(sender.id)}`)
      .send({ giftId: g.id, recipientId: recipient.id });

    expect(res.status).toBe(201);
    expect(res.body.data.coinCost).toBe(g.coinCost);
    expect(res.body.data.beanValue).toBe(g.beanValue);
    expect(res.body.data.recipientType).toBe("user");

    expect((await getWalletBalance(sender.id)).coins).toBe(5_000 - g.coinCost);
    expect((await getWalletBalance(recipient.id)).beans).toBe(
      Math.floor(g.beanValue * 0.7),
    );

    const level = await prisma.userLevel.findUnique({
      where: { userId: recipient.id },
    });
    expect(level?.charmXp).toBe(BigInt(g.beanValue));
    expect(level?.charmLevel).toBeGreaterThanOrEqual(1);
  });

  it("sends a gift to an agent-host (host 70% + agent direct commission)", async () => {
    const sender = await createTestUser({ coinBalance: 5_000 });
    const agent = await createTestUser({ role: "agent" });
    await createTestAgency({ ownerId: agent.id });
    const host = await createTestUser({
      role: "host",
      hostType: "agent_host",
      agentId: agent.id,
    });
    const g = await crown();

    const res = await request(app)
      .post("/api/v1/gifts/send")
      .set("Authorization", `Bearer ${mintJwt(sender.id)}`)
      .send({ giftId: g.id, recipientId: host.id });

    expect(res.status).toBe(201);
    const hostShare = Math.floor(g.beanValue * 0.7);
    // Rolling 30-day agency turnover PRE = 0 → tier A (4%)
    const commission = Math.floor(hostShare * 0.04);

    expect((await getWalletBalance(host.id)).beans).toBe(hostShare);
    expect((await getWalletBalance(agent.id)).beans).toBe(commission);
  });

  it("rejects sending to yourself", async () => {
    const sender = await createTestUser({ coinBalance: 5_000 });
    const g = await crown();
    const res = await request(app)
      .post("/api/v1/gifts/send")
      .set("Authorization", `Bearer ${mintJwt(sender.id)}`)
      .send({ giftId: g.id, recipientId: sender.id });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown gift", async () => {
    const sender = await createTestUser({ coinBalance: 5_000 });
    const recipient = await createTestUser();
    const res = await request(app)
      .post("/api/v1/gifts/send")
      .set("Authorization", `Bearer ${mintJwt(sender.id)}`)
      .send({
        giftId: "00000000-0000-4000-8000-ffffffffffff",
        recipientId: recipient.id,
      });
    expect(res.status).toBe(404);
  });

  it("rejects insufficient coins", async () => {
    const sender = await createTestUser({ coinBalance: 10 });
    const recipient = await createTestUser();
    const g = await crown();
    const res = await request(app)
      .post("/api/v1/gifts/send")
      .set("Authorization", `Bearer ${mintJwt(sender.id)}`)
      .send({ giftId: g.id, recipientId: recipient.id });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/insufficient/i);
  });

  it("rejects requests providing both recipientId and recipientAgencyId", async () => {
    const sender = await createTestUser({ coinBalance: 5_000 });
    const recipient = await createTestUser();
    const agent = await createTestUser({ role: "agent" });
    const agency = await createTestAgency({ ownerId: agent.id });
    const g = await crown();

    const res = await request(app)
      .post("/api/v1/gifts/send")
      .set("Authorization", `Bearer ${mintJwt(sender.id)}`)
      .send({
        giftId: g.id,
        recipientId: recipient.id,
        recipientAgencyId: agency.id,
      });
    expect(res.status).toBe(400);
  });

  it("returns 401 without token", async () => {
    const recipient = await createTestUser();
    const g = await crown();
    const res = await request(app)
      .post("/api/v1/gifts/send")
      .send({ giftId: g.id, recipientId: recipient.id });
    expect(res.status).toBe(401);
  });
});

describe("distributeBeans — tier-race hardening", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("serializes concurrent gifts from different senders at same rolling tier", async () => {
    const senderA = await createTestUser({ coinBalance: 100_000 });
    const senderB = await createTestUser({ coinBalance: 100_000 });

    const agencyOwner = await createTestUser();
    const agency = await createTestAgency({ ownerId: agencyOwner.id });

    const host = await createTestUser({
      role: "host",
      hostType: "agent_host",
      agentId: agencyOwner.id,
    });

    const gift = await prisma.gift.findFirstOrThrow({
      where: { coinCost: 99 },
    });

    await Promise.all([
      sendGift({
        senderId: senderA.id,
        recipientId: host.id,
        giftId: gift.id,
        qty: 1,
      }),
      sendGift({
        senderId: senderB.id,
        recipientId: host.id,
        giftId: gift.id,
        qty: 1,
      }),
    ]);

    const ledger = await prisma.giftCommissionLedger.findMany({
      where: { agencyId: agency.id, commissionType: "direct" },
      orderBy: { createdAt: "asc" },
    });

    expect(ledger).toHaveLength(2);
    const rates = ledger.map((r) => Number(r.rateApplied)).sort();
    // Commission tier uses rolling 30-day turnover PRE (excluding current tx). Tiny gifts do not
    // cross the 2M tier-B floor; concurrent txs both snapshot ~0 rolling PRE → both A-tier.
    expect(rates).toEqual([0.04, 0.04]);
  });
});
