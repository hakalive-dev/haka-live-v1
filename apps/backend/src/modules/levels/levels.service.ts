import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';

export const MAX_LEVEL = 100;

// Shared anchor points for both Rich Level and Charm Level.
// [level, cumulative coins/beans to start that level]
const LEVEL_ANCHORS: [number, number][] = [
  [1,   5_000],
  [6,   85_200],
  [11,  348_800],
  [16,  1_863_700],
  [21,  6_241_800],
  [26,  20_974_400],
  [31,  58_857_000],
  [36,  153_120_900],
  [41,  372_701_500],
  [46,  753_403_800],
  [51,  1_700_000_000],
  [56,  2_950_000_000],
  [61,  4_250_000_000],
  [66,  5_750_000_000],
  [71,  7_300_000_000],
  [76,  9_100_000_000],
  [81,  11_150_000_000],
  [86,  13_450_000_000],
  [91,  16_000_000_000],
  [96,  18_800_000_000],
  [101, 21_850_000_000], // sentinel — cap for Super Level display
];

function buildThresholds(): number[] {
  const out: number[] = new Array(100).fill(0);
  for (let g = 0; g < LEVEL_ANCHORS.length - 1; g++) {
    const [startLvl, startXp] = LEVEL_ANCHORS[g];
    const [nextLvl, nextXp] = LEVEL_ANCHORS[g + 1];
    const span = nextLvl - startLvl;
    for (let i = 0; i < span; i++) {
      const lvl = startLvl + i;
      if (lvl > 100) break;
      out[lvl - 1] = Math.round(startXp + (nextXp - startXp) * i / span);
    }
  }
  return out;
}

export const XP_THRESHOLDS: number[] = buildThresholds();
export const CHARM_XP_THRESHOLDS: number[] = buildThresholds();

/** Calculate level from total XP. */
export function calcLevel(xp: number): number {
  for (let lvl = MAX_LEVEL; lvl >= 1; lvl--) {
    if (xp >= XP_THRESHOLDS[lvl - 1]) return lvl;
  }
  return 1;
}

export function calcCharmLevel(xp: number): number {
  for (let lvl = MAX_LEVEL; lvl >= 1; lvl--) {
    if (xp >= CHARM_XP_THRESHOLDS[lvl - 1]) return lvl;
  }
  return 1;
}

/** Format coin amount as short human-readable string (1.2M, 3.4B). */
export function formatCoins(n: number): string {
  if (n < 1_000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 1).replace(/\.0$/, '')}k`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
}

export interface LevelTier {
  label: string;
  coinsRange: string;
  iconLevel: number;
  minLevel: number;
  maxLevel: number;
  isSuper: boolean;
}

/** Shared tier list used by both Rich Level and Charm Level display. */
function buildTierList(): LevelTier[] {
  return [
    { label: 'Level 0',      coinsRange: '0 - 5k',                iconLevel: 0,   minLevel: 0,   maxLevel: 0,   isSuper: false },
    { label: 'Level 1-5',    coinsRange: '5k - 85.2k',            iconLevel: 5,   minLevel: 1,   maxLevel: 5,   isSuper: false },
    { label: 'Level 6-10',   coinsRange: '85.2k - 348.8k',        iconLevel: 10,  minLevel: 6,   maxLevel: 10,  isSuper: false },
    { label: 'Level 11-15',  coinsRange: '348.8k - 1.8637M',      iconLevel: 15,  minLevel: 11,  maxLevel: 15,  isSuper: false },
    { label: 'Level 16-20',  coinsRange: '1.8637M - 6.2418M',     iconLevel: 20,  minLevel: 16,  maxLevel: 20,  isSuper: false },
    { label: 'Level 21-25',  coinsRange: '6.2418M - 20.9744M',    iconLevel: 25,  minLevel: 21,  maxLevel: 25,  isSuper: false },
    { label: 'Level 26-30',  coinsRange: '20.9744M - 58.857M',    iconLevel: 30,  minLevel: 26,  maxLevel: 30,  isSuper: false },
    { label: 'Level 31-35',  coinsRange: '58.857M - 153.1209M',   iconLevel: 35,  minLevel: 31,  maxLevel: 35,  isSuper: false },
    { label: 'Level 36-40',  coinsRange: '153.1209M - 372.7015M', iconLevel: 40,  minLevel: 36,  maxLevel: 40,  isSuper: false },
    { label: 'Level 41-45',  coinsRange: '372.7015M - 753.4038M', iconLevel: 45,  minLevel: 41,  maxLevel: 45,  isSuper: false },
    { label: 'Level 46-50',  coinsRange: '753.4038M - 1700M',     iconLevel: 50,  minLevel: 46,  maxLevel: 50,  isSuper: false },
    { label: 'Level 51-55',  coinsRange: '1700M - 2950M',         iconLevel: 55,  minLevel: 51,  maxLevel: 55,  isSuper: false },
    { label: 'Level 56-60',  coinsRange: '2950M - 4250M',         iconLevel: 60,  minLevel: 56,  maxLevel: 60,  isSuper: false },
    { label: 'Level 61-65',  coinsRange: '4250M - 5750M',         iconLevel: 65,  minLevel: 61,  maxLevel: 65,  isSuper: false },
    { label: 'Level 66-70',  coinsRange: '5750M - 7300M',         iconLevel: 70,  minLevel: 66,  maxLevel: 70,  isSuper: false },
    { label: 'Level 71-75',  coinsRange: '7300M - 9100M',         iconLevel: 75,  minLevel: 71,  maxLevel: 75,  isSuper: false },
    { label: 'Level 76-80',  coinsRange: '9100M - 11150M',        iconLevel: 80,  minLevel: 76,  maxLevel: 80,  isSuper: false },
    { label: 'Level 81-85',  coinsRange: '11150M - 13450M',       iconLevel: 85,  minLevel: 81,  maxLevel: 85,  isSuper: false },
    { label: 'Level 86-90',  coinsRange: '13450M - 16000M',       iconLevel: 90,  minLevel: 86,  maxLevel: 90,  isSuper: false },
    { label: 'Level 91-95',  coinsRange: '16000M - 18800M',       iconLevel: 95,  minLevel: 91,  maxLevel: 95,  isSuper: false },
    { label: 'Level 96-100', coinsRange: '18800M - 21850M',       iconLevel: 100, minLevel: 96,  maxLevel: 99,  isSuper: false },
    { label: 'Super Level',  coinsRange: '21850M+',               iconLevel: 100, minLevel: 100, maxLevel: 100, isSuper: true  },
  ];
}

export function getTiers(): LevelTier[] {
  return buildTierList();
}

export function getCharmTiers(): LevelTier[] {
  return buildTierList();
}

export async function getOrCreateLevel(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new AppError('User not found', 404);

  return prisma.userLevel.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

export async function getLevel(userId: string) {
  const record = await getOrCreateLevel(userId);
  const richNextThreshold = record.richLevel < MAX_LEVEL ? XP_THRESHOLDS[record.richLevel] : null;
  const charmNextThreshold = record.charmLevel < MAX_LEVEL ? CHARM_XP_THRESHOLDS[record.charmLevel] : null;

  return {
    richLevel: record.richLevel,
    richXp: Number(record.richXp),
    richNextThreshold,
    charmLevel: record.charmLevel,
    charmXp: Number(record.charmXp),
    charmNextThreshold,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function addRichXp(
  userId: string,
  xpAmount: number,
  tx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
) {
  const user = await (tx ? tx.user : prisma.user).findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new AppError('User not found', 404);

  const record = await (tx
    ? tx.userLevel.upsert({ where: { userId }, create: { userId }, update: {} })
    : getOrCreateLevel(userId));

  const newXp = Number(record.richXp) + xpAmount;
  const newLevel = calcLevel(newXp);

  return (tx ? tx.userLevel : prisma.userLevel).update({
    where: { userId },
    data: { richXp: BigInt(newXp), richLevel: newLevel },
  });
}

export async function addCharmXp(
  userId: string,
  xpAmount: number,
  tx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
) {
  const user = await (tx ? tx.user : prisma.user).findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new AppError('User not found', 404);

  const record = await (tx
    ? tx.userLevel.upsert({ where: { userId }, create: { userId }, update: {} })
    : getOrCreateLevel(userId));

  const newXp = Number(record.charmXp) + xpAmount;
  const newLevel = calcCharmLevel(newXp);

  return (tx ? tx.userLevel : prisma.userLevel).update({
    where: { userId },
    data: { charmXp: BigInt(newXp), charmLevel: newLevel },
  });
}

export async function getLevelByUserId(userId: string) {
  return getLevel(userId);
}

export async function getRichLeaderboard(limit = 50) {
  return prisma.userLevel.findMany({
    orderBy: [{ richLevel: 'desc' }, { richXp: 'desc' }],
    take: limit,
    include: {
      user: { select: { id: true, displayName: true, avatar: true, hakaId: true } },
    },
  });
}

export async function getCharmLeaderboard(limit = 50) {
  return prisma.userLevel.findMany({
    orderBy: [{ charmLevel: 'desc' }, { charmXp: 'desc' }],
    take: limit,
    include: {
      user: { select: { id: true, displayName: true, avatar: true, hakaId: true } },
    },
  });
}
