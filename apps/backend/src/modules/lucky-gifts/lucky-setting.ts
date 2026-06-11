import { prisma } from '../../config/prisma';

export interface LuckySetting {
  enabled: boolean;
  winProbability: number;
  winMultiplier: number;
  receiverBenefitPercent: number;
  dailyUserWinCapCoins: bigint;
  updatedBy: string;
  updatedAt: Date;
}

// Setting changes rarely (admin edits). Cached for the lifetime of the process;
// admin lucky-gifts routes call `clearLuckySettingCache()` on write — same
// pattern as the commission tier cache. Hot gift path stays DB-free.
let cache: LuckySetting | null = null;

export function clearLuckySettingCache(): void {
  cache = null;
}

export async function getLuckySetting(): Promise<LuckySetting> {
  if (cache) return cache;
  // Upsert so a database created before the seed row (or wiped in tests) heals itself.
  const row = await prisma.luckyGiftSetting.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  });
  cache = {
    enabled: row.enabled,
    winProbability: Number(row.winProbability),
    winMultiplier: Number(row.winMultiplier),
    receiverBenefitPercent: Number(row.receiverBenefitPercent),
    dailyUserWinCapCoins: row.dailyUserWinCapCoins,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
  };
  return cache;
}
