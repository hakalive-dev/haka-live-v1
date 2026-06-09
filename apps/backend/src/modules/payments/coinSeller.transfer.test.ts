import { randomUUID } from "crypto";
import { prisma } from "../../config/prisma";
import { resetDb } from "../../tests/db-helpers";
import { coinSellerService, countUniqueCustomers } from "./coinSeller.service";

beforeEach(async () => {
  await resetDb();
});

async function createSellerWithCoins(availableCoins: number) {
  const id = randomUUID();
  await prisma.user.create({
    data: {
      id,
      supabaseUid: `fb-${id}`,
      displayName: "Coin Seller",
      username: `u_${id.slice(0, 8)}`,
      hakaId: `HAKA${id.slice(0, 8)}`,
      onboardingComplete: true,
      wallet: { create: {} },
      coinSellerProfile: {
        create: {
          availableBalance: availableCoins,
          totalBalance: availableCoins,
        },
      },
    },
  });
  return prisma.user.findUniqueOrThrow({ where: { id } });
}

describe("coinSellerService.transfer", () => {
  it("credits own user wallet when transferring to self (target_type user)", async () => {
    const seller = await createSellerWithCoins(2000);
    await coinSellerService.transfer(seller.id, seller.hakaId!, 500, "user");

    const profile = await prisma.coinSellerProfile.findUnique({
      where: { userId: seller.id },
    });
    const wallet = await prisma.wallet.findUnique({
      where: { userId: seller.id },
    });
    expect(profile!.availableBalance).toBe(1500);
    expect(wallet!.coinBalance).toBe(500);
  });

  it("resolves recipient by active special id and credits their wallet", async () => {
    const seller = await createSellerWithCoins(2000);
    const buyerId = randomUUID();
    await prisma.user.create({
      data: {
        id: buyerId,
        supabaseUid: `fb-${buyerId}`,
        displayName: "Buyer",
        username: `b_${buyerId.slice(0, 8)}`,
        hakaId: `HBUY${buyerId.slice(0, 6)}`,
        onboardingComplete: true,
        activeSpecialId: "998877",
        activeSpecialIdExpiresAt: new Date(Date.now() + 86_400_000),
        wallet: { create: {} },
      },
    });

    await coinSellerService.transfer(seller.id, "998877", 200, "user");

    const buyerWallet = await prisma.wallet.findUnique({
      where: { userId: buyerId },
    });
    expect(buyerWallet!.coinBalance).toBe(200);
    const sellerProfile = await prisma.coinSellerProfile.findUnique({
      where: { userId: seller.id },
    });
    expect(sellerProfile!.availableBalance).toBe(1800);
  });

  it("rejects self-transfer when target_type is coin_seller", async () => {
    const seller = await createSellerWithCoins(2000);
    await expect(
      coinSellerService.transfer(seller.id, seller.id, 100, "coin_seller"),
    ).rejects.toThrow(/Cannot transfer to your own seller balance/);
  });
});

describe("coinSellerService.getOrCreateProfile total_customers", () => {
  async function createBuyer() {
    const buyerId = randomUUID();
    await prisma.user.create({
      data: {
        id: buyerId,
        supabaseUid: `fb-${buyerId}`,
        displayName: "Buyer",
        username: `b_${buyerId.slice(0, 8)}`,
        hakaId: `HBUY${buyerId.slice(0, 6)}`,
        onboardingComplete: true,
        wallet: { create: {} },
      },
    });
    return prisma.user.findUniqueOrThrow({ where: { id: buyerId } });
  }

  it("counts distinct transfer recipients (not repeat transfers)", async () => {
    const seller = await createSellerWithCoins(10_000);
    const buyerA = await createBuyer();
    const buyerB = await createBuyer();

    const before = await coinSellerService.getOrCreateProfile(seller.id);
    expect(before.total_customers).toBe(0);

    await coinSellerService.transfer(seller.id, buyerA.hakaId!, 100, "user");
    const afterFirst = await coinSellerService.getOrCreateProfile(seller.id);
    expect(afterFirst.total_customers).toBe(1);
    expect(await countUniqueCustomers(seller.id)).toBe(1);

    await coinSellerService.transfer(seller.id, buyerA.hakaId!, 50, "user");
    const afterRepeat = await coinSellerService.getOrCreateProfile(seller.id);
    expect(afterRepeat.total_customers).toBe(1);

    await coinSellerService.transfer(seller.id, buyerB.hakaId!, 75, "user");
    const afterSecond = await coinSellerService.getOrCreateProfile(seller.id);
    expect(afterSecond.total_customers).toBe(2);
  });

  it("does not count seller-to-seller stock transfers as customers", async () => {
    const seller = await createSellerWithCoins(10_000);
    const otherSellerId = randomUUID();
    await prisma.user.create({
      data: {
        id: otherSellerId,
        supabaseUid: `fb-${otherSellerId}`,
        displayName: "Other Seller",
        username: `s_${otherSellerId.slice(0, 8)}`,
        hakaId: `HSEL${otherSellerId.slice(0, 6)}`,
        onboardingComplete: true,
        wallet: { create: {} },
        coinSellerProfile: { create: { availableBalance: 0, totalBalance: 0 } },
      },
    });

    await coinSellerService.transfer(
      seller.id,
      otherSellerId,
      100,
      "coin_seller",
    );
    await coinSellerService.transfer(
      seller.id,
      otherSellerId,
      50,
      "coin_seller",
    );

    const profile = await coinSellerService.getOrCreateProfile(seller.id);
    expect(profile.total_customers).toBe(0);
  });

  it("does not count self wallet top-ups as a customer", async () => {
    const seller = await createSellerWithCoins(5000);
    await coinSellerService.transfer(seller.id, seller.hakaId!, 100, "user");
    await coinSellerService.transfer(seller.id, seller.hakaId!, 50, "user");
    const profile = await coinSellerService.getOrCreateProfile(seller.id);
    expect(profile.total_customers).toBe(0);
  });
});

describe("coinSellerService.submitExchangeRequest (instant beans → seller coins)", () => {
  it("debits beans and credits seller balance in one transaction", async () => {
    const id = randomUUID();
    await prisma.user.create({
      data: {
        id,
        supabaseUid: `fb-${id}`,
        displayName: "Seller",
        username: `u_${id.slice(0, 8)}`,
        hakaId: `HAKA${id.slice(0, 8)}`,
        onboardingComplete: true,
        wallet: { create: { beanBalance: 5000 } },
        coinSellerProfile: { create: { availableBalance: 0, totalBalance: 0 } },
      },
    });

    const result = await coinSellerService.submitExchangeRequest(id, 1000);

    expect(result.status).toBe("approved");
    const wallet = await prisma.wallet.findUnique({ where: { userId: id } });
    const profile = await prisma.coinSellerProfile.findUnique({
      where: { userId: id },
    });
    expect(wallet!.beanBalance).toBe(4000);
    expect(profile!.availableBalance).toBe(1000);
    const txs = await prisma.coinSellerTransaction.findMany({
      where: { sellerId: id },
    });
    expect(txs).toHaveLength(1);
    expect(txs[0].transactionType).toBe("exchange");
    const req = await prisma.sellerExchangeRequest.findFirst({
      where: { sellerId: id },
    });
    expect(req?.status).toBe("approved");
    expect(req?.processedById).toBeNull();
  });
});
