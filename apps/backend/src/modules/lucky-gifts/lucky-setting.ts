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

// Read from DB on every call — lucky gifts are infrequent and a stale in-process
// cache (e.g. after migrations or admin toggles without hitting this process)
// would silently skip the draw. Admin writes still call clearLuckySettingCache()
// for tests that stub the module.
let cache: LuckySetting | null = null;

export function clearLuckySettingCache(): void {
  cache = null;
}

function rowToSetting(row: {
  enabled: boolean;
  winProbability: unknown;
  winMultiplier: unknown;
  receiverBenefitPercent: unknown;
  dailyUserWinCapCoins: bigint;
  updatedBy: string;
  updatedAt: Date;
}): LuckySetting {
  return {
    enabled: row.enabled,
    winProbability: Number(row.winProbability),
    winMultiplier: Number(row.winMultiplier),
    receiverBenefitPercent: Number(row.receiverBenefitPercent),
    dailyUserWinCapCoins: row.dailyUserWinCapCoins,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
  };
}

export async function getLuckySetting(): Promise<LuckySetting> {
  // Upsert so a database created before the seed row (or wiped in tests) heals itself.
  const row = await prisma.luckyGiftSetting.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  });
  const setting = rowToSetting(row);
  cache = setting;
  return setting;
}
