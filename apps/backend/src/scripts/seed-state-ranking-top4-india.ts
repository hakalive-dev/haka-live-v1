/**
 * One-time post-deploy seed: top 4 Indian states × 4 female hosts (Postgres + Redis).
 *
 * Skips entirely when marker user ff4e0001-… already exists.
 *
 * Manual run:
 *   npm run seed:state-ranking-top4
 *   docker compose -f docker-compose.dev.yml exec backend npm run seed:state-ranking-top4
 */

import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import bcrypt from 'bcryptjs';
import {
  dailyDateKey,
  stateHostsRedisKey,
  stateTotalsRedisKey,
} from '../modules/leaderboard/state-ranking-keys';
import { env } from '../config/env';

export const STATE_RANKING_TOP4_MARKER_USER_ID = 'ff4e0001-0000-4000-8000-000000000001';

type HostSeed = {
  ord: number;
  id: string;
  stateCode: 'MH' | 'KA' | 'TN' | 'UP';
  hostRank: number;
  giftScore: number;
  username: string;
  displayName: string;
  avatar: string;
  richLevel: number;
  charmLevel: number;
};

export const STATE_RANKING_TOP4_HOSTS: HostSeed[] = [
  { ord: 1, id: 'ff4e0001-0000-4000-8000-000000000001', stateCode: 'MH', hostRank: 1, giftScore: 520_000, username: 'sr_mh_ananya', displayName: 'Ananya Deshmukh', avatar: 'https://i.pravatar.cc/150?u=sr_mh_01', richLevel: 42, charmLevel: 38 },
  { ord: 2, id: 'ff4e0002-0000-4000-8000-000000000002', stateCode: 'MH', hostRank: 2, giftScore: 410_000, username: 'sr_mh_priya', displayName: 'Priya Kulkarni', avatar: 'https://i.pravatar.cc/150?u=sr_mh_02', richLevel: 35, charmLevel: 31 },
  { ord: 3, id: 'ff4e0003-0000-4000-8000-000000000003', stateCode: 'MH', hostRank: 3, giftScore: 305_000, username: 'sr_mh_isha', displayName: 'Isha Patil', avatar: 'https://i.pravatar.cc/150?u=sr_mh_03', richLevel: 28, charmLevel: 44 },
  { ord: 4, id: 'ff4e0004-0000-4000-8000-000000000004', stateCode: 'MH', hostRank: 4, giftScore: 198_000, username: 'sr_mh_kavya', displayName: 'Kavya Joshi', avatar: 'https://i.pravatar.cc/150?u=sr_mh_04', richLevel: 22, charmLevel: 27 },
  { ord: 5, id: 'ff4e0005-0000-4000-8000-000000000005', stateCode: 'KA', hostRank: 1, giftScore: 480_000, username: 'sr_ka_meera', displayName: 'Meera Reddy', avatar: 'https://i.pravatar.cc/150?u=sr_ka_01', richLevel: 39, charmLevel: 41 },
  { ord: 6, id: 'ff4e0006-0000-4000-8000-000000000006', stateCode: 'KA', hostRank: 2, giftScore: 375_000, username: 'sr_ka_divya', displayName: 'Divya Iyer', avatar: 'https://i.pravatar.cc/150?u=sr_ka_02', richLevel: 33, charmLevel: 36 },
  { ord: 7, id: 'ff4e0007-0000-4000-8000-000000000007', stateCode: 'KA', hostRank: 3, giftScore: 280_000, username: 'sr_ka_shreya', displayName: 'Shreya Nair', avatar: 'https://i.pravatar.cc/150?u=sr_ka_03', richLevel: 26, charmLevel: 29 },
  { ord: 8, id: 'ff4e0008-0000-4000-8000-000000000008', stateCode: 'KA', hostRank: 4, giftScore: 175_000, username: 'sr_ka_lakshmi', displayName: 'Lakshmi Rao', avatar: 'https://i.pravatar.cc/150?u=sr_ka_04', richLevel: 19, charmLevel: 24 },
  { ord: 9, id: 'ff4e0009-0000-4000-8000-000000000009', stateCode: 'TN', hostRank: 1, giftScore: 445_000, username: 'sr_tn_kavitha', displayName: 'Kavitha Murugan', avatar: 'https://i.pravatar.cc/150?u=sr_tn_01', richLevel: 37, charmLevel: 52 },
  { ord: 10, id: 'ff4e0010-0000-4000-8000-000000000010', stateCode: 'TN', hostRank: 2, giftScore: 350_000, username: 'sr_tn_deepa', displayName: 'Deepa Selvam', avatar: 'https://i.pravatar.cc/150?u=sr_tn_02', richLevel: 31, charmLevel: 45 },
  { ord: 11, id: 'ff4e0011-0000-4000-8000-000000000011', stateCode: 'TN', hostRank: 3, giftScore: 265_000, username: 'sr_tn_janani', displayName: 'Janani Krishnan', avatar: 'https://i.pravatar.cc/150?u=sr_tn_03', richLevel: 24, charmLevel: 33 },
  { ord: 12, id: 'ff4e0012-0000-4000-8000-000000000012', stateCode: 'TN', hostRank: 4, giftScore: 160_000, username: 'sr_tn_malini', displayName: 'Malini Venkat', avatar: 'https://i.pravatar.cc/150?u=sr_tn_04', richLevel: 18, charmLevel: 21 },
  { ord: 13, id: 'ff4e0013-0000-4000-8000-000000000013', stateCode: 'UP', hostRank: 1, giftScore: 400_000, username: 'sr_up_pooja', displayName: 'Pooja Singh', avatar: 'https://i.pravatar.cc/150?u=sr_up_01', richLevel: 36, charmLevel: 34 },
  { ord: 14, id: 'ff4e0014-0000-4000-8000-000000000014', stateCode: 'UP', hostRank: 2, giftScore: 310_000, username: 'sr_up_neha', displayName: 'Neha Verma', avatar: 'https://i.pravatar.cc/150?u=sr_up_02', richLevel: 29, charmLevel: 28 },
  { ord: 15, id: 'ff4e0015-0000-4000-8000-000000000015', stateCode: 'UP', hostRank: 3, giftScore: 230_000, username: 'sr_up_riya', displayName: 'Riya Gupta', avatar: 'https://i.pravatar.cc/150?u=sr_up_03', richLevel: 23, charmLevel: 26 },
  { ord: 16, id: 'ff4e0016-0000-4000-8000-000000000016', stateCode: 'UP', hostRank: 4, giftScore: 145_000, username: 'sr_up_sunita', displayName: 'Sunita Yadav', avatar: 'https://i.pravatar.cc/150?u=sr_up_04', richLevel: 17, charmLevel: 19 },
];

const STATE_TOTALS: Array<{ code: HostSeed['stateCode']; score: number }> = [
  { code: 'MH', score: 1_433_000 },
  { code: 'KA', score: 1_310_000 },
  { code: 'TN', score: 1_220_000 },
  { code: 'UP', score: 1_085_000 },
];

function walletId(ord: number): string {
  return `ee4e0001-0000-4000-8000-${String(ord).padStart(12, '0')}`;
}

function levelId(ord: number): string {
  return `dd4e0001-0000-4000-8000-${String(ord).padStart(12, '0')}`;
}

async function nextHakaIdBase(prisma: PrismaClient): Promise<bigint> {
  const rows = await prisma.$queryRaw<{ max_hid: bigint | null }[]>`
    SELECT COALESCE(MAX(CAST("hakaId" AS BIGINT)), 500000000::BIGINT) AS max_hid
    FROM users
    WHERE "hakaId" ~ '^[0-9]+$'
  `;
  return rows[0]?.max_hid ?? 500_000_000n;
}

async function seedPostgres(prisma: PrismaClient, passwordHash: string, hakaBase: bigint): Promise<void> {
  for (const host of STATE_RANKING_TOP4_HOSTS) {
    const hakaId = (hakaBase + BigInt(host.ord)).toString();
    const bio = `State Star seed · ${host.stateCode} rank #${host.hostRank}`;

    await prisma.user.upsert({
      where: { id: host.id },
      create: {
        id: host.id,
        supabaseUid: `seed-sr4-${host.stateCode}-${String(host.hostRank).padStart(2, '0')}`,
        password: passwordHash,
        role: 'host',
        hostType: 'independent',
        hostApplicationPath: 'self_apply_independent',
        gender: 'female',
        isVerifiedHost: true,
        faceVerificationStatus: 'approved',
        onboardingComplete: true,
        displayName: host.displayName,
        username: host.username,
        hakaId,
        avatar: host.avatar,
        country: 'India',
        state: host.stateCode,
        bio,
      },
      update: {
        password: passwordHash,
        role: 'host',
        hostType: 'independent',
        hostApplicationPath: 'self_apply_independent',
        gender: 'female',
        isVerifiedHost: true,
        faceVerificationStatus: 'approved',
        onboardingComplete: true,
        displayName: host.displayName,
        username: host.username,
        avatar: host.avatar,
        country: 'India',
        state: host.stateCode,
        bio,
      },
    });

    await prisma.wallet.upsert({
      where: { userId: host.id },
      create: {
        id: walletId(host.ord),
        userId: host.id,
        coinBalance: BigInt(15_000 + ((host.ord * 137) % 40_000)),
        beanBalance: BigInt(Math.floor(host.giftScore / 4)),
      },
      update: {
        coinBalance: BigInt(15_000 + ((host.ord * 137) % 40_000)),
        beanBalance: BigInt(Math.floor(host.giftScore / 4)),
      },
    });

    await prisma.userLevel.upsert({
      where: { userId: host.id },
      create: {
        id: levelId(host.ord),
        userId: host.id,
        richLevel: host.richLevel,
        richXp: BigInt(host.richLevel * 8_500 + host.ord * 111),
        charmLevel: host.charmLevel,
        charmXp: BigInt(host.charmLevel * 12_000 + host.ord * 97),
      },
      update: {
        richLevel: host.richLevel,
        richXp: BigInt(host.richLevel * 8_500 + host.ord * 111),
        charmLevel: host.charmLevel,
        charmXp: BigInt(host.charmLevel * 12_000 + host.ord * 97),
      },
    });
  }
}

async function seedRedis(redis: Redis, dateKey: string): Promise<void> {
  const totalsKey = stateTotalsRedisKey('IN', dateKey);
  const pipe = redis.pipeline();
  pipe.del(totalsKey);
  for (const row of STATE_TOTALS) {
    pipe.zadd(totalsKey, row.score, row.code);
  }

  for (const stateCode of ['MH', 'KA', 'TN', 'UP'] as const) {
    const hostsKey = stateHostsRedisKey('IN', stateCode, dateKey);
    const hosts = STATE_RANKING_TOP4_HOSTS.filter((h) => h.stateCode === stateCode);
    pipe.del(hostsKey);
    for (const host of hosts) {
      pipe.zadd(hostsKey, host.giftScore, host.id);
    }
  }

  await pipe.exec();
}

export type StateRankingTop4SeedResult = 'skipped' | 'seeded';

/**
 * Seeds 16 female hosts + today's Redis state boards.
 * No-op when marker user already exists (safe on every deploy boot).
 */
export async function seedStateRankingTop4India(
  prisma: PrismaClient,
  redis: Redis,
): Promise<StateRankingTop4SeedResult> {
  if (process.env.SKIP_STATE_RANKING_TOP4_SEED === 'true') {
    console.log('⭐ State Star top4 seed skipped (SKIP_STATE_RANKING_TOP4_SEED=true)');
    return 'skipped';
  }

  const existing = await prisma.user.findUnique({
    where: { id: STATE_RANKING_TOP4_MARKER_USER_ID },
    select: { id: true },
  });
  if (existing) {
    console.log('⭐ State Star top4 seed already applied — skipping');
    return 'skipped';
  }

  const password = env.DEV_LOGIN_PASSWORD ?? 'haka2024';
  const passwordHash = await bcrypt.hash(password, 10);
  const hakaBase = await nextHakaIdBase(prisma);
  const dateKey = dailyDateKey();

  await seedPostgres(prisma, passwordHash, hakaBase);
  await seedRedis(redis, dateKey);

  const firstHaka = (hakaBase + 1n).toString();
  const lastHaka = (hakaBase + BigInt(STATE_RANKING_TOP4_HOSTS.length)).toString();
  console.log(
    `⭐ State Star top4 seed complete — 16 hosts (Haka ${firstHaka}–${lastHaka}), ` +
      `Redis boards for ${dateKey} (IN: MH/KA/TN/UP)`,
  );
  return 'seeded';
}

async function main() {
  const { prisma } = await import('../config/prisma');
  const { redis } = await import('../config/redis');

  try {
    await prisma.$connect();
    const result = await seedStateRankingTop4India(prisma, redis);
    if (result === 'seeded') {
      const hosts = await prisma.user.findMany({
        where: { id: { in: STATE_RANKING_TOP4_HOSTS.map((h) => h.id) } },
        select: { hakaId: true, username: true, state: true },
        orderBy: { hakaId: 'asc' },
      });
      console.log(hosts);
    }
  } finally {
    await prisma.$disconnect();
    redis.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('❌ State Star top4 seed failed:', err);
    process.exit(1);
  });
}
