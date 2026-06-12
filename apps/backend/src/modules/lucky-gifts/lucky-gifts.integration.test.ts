import { randomUUID } from "crypto";
import request from "supertest";
import app from "../../app";
import { prisma } from "../../config/prisma";
import {
  resetDb,
  createTestUser,
  mintJwt,
  getWalletBalance,
} from "../../tests/db-helpers";
import { clearLuckySettingCache } from "./lucky-setting";

/**
 * Lucky Gifts end-to-end: POST /gifts/send against the real test DB.
 * Outcomes are made deterministic by pinning winProbability to 1 (always win)
 * or 0 (always lose) on the singleton setting.
 */

const GIFT_COIN_COST = 100;
const GIFT_BEAN_VALUE = 100;
const START_COINS = 1_000;

async function createGift(category: string) {
  return prisma.gift.create({
    data: {
      name: `Test ${category} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      coinCost: GIFT_COIN_COST,
      beanValue: GIFT_BEAN_VALUE,
      category,
      isActive: true,
    },
  });
}

async function setLuckySetting(input: {
  enabled: boolean;
  winProbability?: number;
  winMultiplier?: number;
  receiverBenefitPercent?: number;
}) {
  await prisma.luckyGiftSetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...input },
    update: {
      enabled: input.enabled,
      winProbability: input.winProbability ?? 0.2,
      winMultiplier: input.winMultiplier ?? 3.0,
      receiverBenefitPercent: input.receiverBenefitPercent ?? 1.5,
    },
  });
  clearLuckySettingCache();
}

async function createRoom(hostId: string) {
  return prisma.room.create({
    data: {
      hostId,
      title: "Test Room",
      agoraChannel: `ch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      micConfig: 5,
    },
  });
}

async function sendGift(
  senderId: string,
  giftId: string,
  recipientId: string,
  roomId?: string,
) {
  return request(app)
    .post("/api/v1/gifts/send")
    .set("Authorization", `Bearer ${mintJwt(senderId)}`)
    .send({ giftId, recipientId, qty: 1, ...(roomId ? { roomId } : {}) });
}

describe("Lucky Gifts send flow", () => {
  let senderId: string;
  let hostId: string;

  beforeEach(async () => {
    await resetDb();
    const sender = await createTestUser({ coinBalance: START_COINS });
    const host = await createTestUser({ role: "host" });
    senderId = sender.id;
    hostId = host.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("win: credits the sender atomically, reduces host beans, logs the draw", async () => {
    await setLuckySetting({
      enabled: true,
      winProbability: 1,
      winMultiplier: 3,
      receiverBenefitPercent: 1.5,
    });
    const gift = await createGift("lucky");

    const res = await sendGift(senderId, gift.id, hostId);
    expect(res.status).toBe(201);
    expect(res.body.data.luckyDraw).toMatchObject({
      isWin: true,
      rewardCoins: 300, // 100 × 3
      coinCost: 100,
    });

    // Sender: -100 stake +300 win
    const senderWallet = await getWalletBalance(senderId);
    expect(senderWallet.coins).toBe(START_COINS - 100 + 300);

    // Host: bean pool = round(100 × 1.5%) = 2 → hostBeans = floor(2 × 0.7) = 1
    const hostWallet = await getWalletBalance(hostId);
    expect(hostWallet.beans).toBe(1);

    // Draw row logged with the config snapshot + actual host cut.
    const draw = await prisma.luckyGiftDraw.findUniqueOrThrow({
      where: { giftTransactionId: res.body.data.id },
    });
    expect(draw.isWin).toBe(true);
    expect(draw.rewardCoins).toBe(300);
    expect(draw.receiverBeans).toBe(1);
    expect(Number(draw.winProbability)).toBe(1);

    // Wallet transactions: stake debit + lucky_reward credit.
    const txs = await prisma.walletTransaction.findMany({
      where: { wallet: { userId: senderId } },
      orderBy: { createdAt: "asc" },
    });
    const refs = txs.map((t) => t.reference);
    expect(refs).toContain("gift_sent");
    expect(refs).toContain("lucky_reward");
    const reward = txs.find((t) => t.reference === "lucky_reward")!;
    expect(Number(reward.amount)).toBe(300);
    expect(Number(reward.balanceAfter)).toBe(START_COINS - 100 + 300);

    // GiftTransaction stores the REDUCED bean pool.
    expect(res.body.data.beanValue).toBe(2);
  });

  it("lose: no reward, draw still logged, host still gets the reduced cut", async () => {
    await setLuckySetting({ enabled: true, winProbability: 0 });
    const gift = await createGift("lucky");

    const res = await sendGift(senderId, gift.id, hostId);
    expect(res.status).toBe(201);
    expect(res.body.data.luckyDraw).toMatchObject({ isWin: false, rewardCoins: 0 });

    const senderWallet = await getWalletBalance(senderId);
    expect(senderWallet.coins).toBe(START_COINS - 100);

    const draw = await prisma.luckyGiftDraw.findUniqueOrThrow({
      where: { giftTransactionId: res.body.data.id },
    });
    expect(draw.isWin).toBe(false);
    expect(draw.rewardCoins).toBe(0);

    const rewardTx = await prisma.walletTransaction.findFirst({
      where: { reference: "lucky_reward" },
    });
    expect(rewardTx).toBeNull();
  });

  it("kill-switch off: lucky-category gift takes the normal path (full beans, no draw)", async () => {
    await setLuckySetting({ enabled: false, winProbability: 1 });
    const gift = await createGift("lucky");

    const res = await sendGift(senderId, gift.id, hostId);
    expect(res.status).toBe(201);
    expect(res.body.data.luckyDraw).toBeNull();

    // Normal distribution: hostBeans = floor(100 × 0.7) = 70
    const hostWallet = await getWalletBalance(hostId);
    expect(hostWallet.beans).toBe(70);

    expect(await prisma.luckyGiftDraw.count()).toBe(0);
  });

  it("non-lucky category never draws even when the game is enabled", async () => {
    await setLuckySetting({ enabled: true, winProbability: 1 });
    const gift = await createGift("hot");

    const res = await sendGift(senderId, gift.id, hostId);
    expect(res.status).toBe(201);
    expect(res.body.data.luckyDraw).toBeNull();

    const hostWallet = await getWalletBalance(hostId);
    expect(hostWallet.beans).toBe(70);
    expect(await prisma.luckyGiftDraw.count()).toBe(0);
  });

  it("insufficient balance is rejected before any draw", async () => {
    await setLuckySetting({ enabled: true, winProbability: 1 });
    const gift = await createGift("lucky");
    const broke = await createTestUser({ coinBalance: 10 });

    const res = await sendGift(broke.id, gift.id, hostId);
    expect(res.status).toBe(400);
    expect(await prisma.luckyGiftDraw.count()).toBe(0);
    const wallet = await getWalletBalance(broke.id);
    expect(wallet.coins).toBe(10);
  });

  it("GET /gifts/lucky/history returns the sender's draws", async () => {
    await setLuckySetting({ enabled: true, winProbability: 1, winMultiplier: 2 });
    const gift = await createGift("lucky");
    await sendGift(senderId, gift.id, hostId);
    await sendGift(senderId, gift.id, hostId);

    const res = await request(app)
      .get("/api/v1/gifts/lucky/history")
      .set("Authorization", `Bearer ${mintJwt(senderId)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.items[0]).toMatchObject({
      isWin: true,
      rewardCoins: 200,
      coinCost: 100,
    });
    expect(res.body.data.items[0].gift.id).toBe(gift.id);
  });

  it("GET /gifts/lucky/room/:roomId/rankings orders senders by total rewardCoins", async () => {
    await setLuckySetting({ enabled: true, winProbability: 1, winMultiplier: 2 });
    const gift = await createGift("lucky");
    const room = await createRoom(hostId);
    const sender2 = await createTestUser({ coinBalance: START_COINS });

    await sendGift(senderId, gift.id, hostId, room.id);
    await sendGift(senderId, gift.id, hostId, room.id);
    await sendGift(sender2.id, gift.id, hostId, room.id);

    const res = await request(app)
      .get(`/api/v1/gifts/lucky/room/${room.id}/rankings`)
      .set("Authorization", `Bearer ${mintJwt(senderId)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items[0]).toMatchObject({
      rank: 1,
      score: 400,
      user: { id: senderId },
    });
    expect(res.body.data.items[1]).toMatchObject({
      rank: 2,
      score: 200,
      user: { id: sender2.id },
    });
  });

  it("GET /gifts/lucky/room/:roomId/history returns room wins newest-first", async () => {
    await setLuckySetting({ enabled: true, winProbability: 1, winMultiplier: 2 });
    const gift = await createGift("lucky");
    const room = await createRoom(hostId);
    const otherRoom = await createRoom(hostId);

    await sendGift(senderId, gift.id, hostId, room.id);
    await sendGift(senderId, gift.id, hostId, room.id);
    await sendGift(senderId, gift.id, hostId, otherRoom.id);

    const res = await request(app)
      .get(`/api/v1/gifts/lucky/room/${room.id}/history`)
      .set("Authorization", `Bearer ${mintJwt(senderId)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items[0]).toMatchObject({
      rewardCoins: 200,
      user: { id: senderId },
      gift: { id: gift.id },
    });
    expect(res.body.data.items.every((i: { rewardCoins: number }) => i.rewardCoins === 200)).toBe(
      true,
    );
  });

  it("GET /gifts/lucky/room/:roomId/rankings returns 404 for unknown room", async () => {
    const res = await request(app)
      .get(`/api/v1/gifts/lucky/room/${randomUUID()}/rankings`)
      .set("Authorization", `Bearer ${mintJwt(senderId)}`);
    expect(res.status).toBe(404);
  });
});
