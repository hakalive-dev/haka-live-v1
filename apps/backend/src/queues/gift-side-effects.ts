import { getSystemQueue, SystemJobNames } from "./system-queue";

export type GiftSideEffectsJobData = {
  senderId: string;
  hostUserId: string;
  totalCoinCost: number;
  totalBeanValue: number;
  roomId: string | null;
  recipientId: string | null;
  skipEarnerLeaderboard: boolean;
  /** Coins won on the lucky draw (0 = no win / not a lucky gift). Optional for in-flight jobs from older deploys. */
  luckyRewardCoins?: number;
};

export async function enqueueGiftSideEffects(
  data: GiftSideEffectsJobData,
): Promise<void> {
  const queue = getSystemQueue();
  await queue.add(SystemJobNames.GIFT_SIDE_EFFECTS, data, {
    attempts: 2,
    backoff: { type: "fixed", delay: 500 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 200 },
  });
}

export async function processGiftSideEffects(
  data: GiftSideEffectsJobData,
): Promise<void> {
  const {
    updateRichScore,
    updateCharmScore,
    updateGifterScore,
    updateEarnerScore,
    updateLuckyWinnerScore,
  } = await import("../modules/leaderboard/leaderboard.service");
  void updateRichScore(data.senderId, data.totalCoinCost).catch(
    () => undefined,
  );
  void updateCharmScore(data.hostUserId, data.totalBeanValue).catch(
    () => undefined,
  );
  void updateGifterScore(data.senderId, data.totalCoinCost).catch(
    () => undefined,
  );

  if (!data.skipEarnerLeaderboard) {
    void updateEarnerScore(data.hostUserId, data.totalBeanValue).catch(
      () => undefined,
    );
  }

  if ((data.luckyRewardCoins ?? 0) > 0) {
    void updateLuckyWinnerScore(data.senderId, data.luckyRewardCoins!).catch(
      () => undefined,
    );
  }
}
