/**
 * Local seeder — verified female host in India (State Star rankings).
 *
 * Run (docker dev stack up):
 *   docker compose -f docker-compose.dev.yml exec backend \
 *     npx ts-node prisma/seed-state-ranking-host.ts
 *
 * Or from apps/backend:
 *   npm run seed:state-ranking-host
 *
 * Login: Haka ID 500000098 · password DEV_LOGIN_PASSWORD (default haka2024)
 * Safe to re-run: upserts throughout.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import {
  dailyDateKey,
  stateHostsRedisKey,
  stateTotalsRedisKey,
} from '../src/modules/leaderboard/state-ranking-keys';

const prisma = new PrismaClient();

const STATE_HOST_ID = '99999999-9999-4999-8999-900001000098';
const TN_HOST_1 = '99999999-9999-4999-8999-900001000091';
const TN_HOST_3 = '99999999-9999-4999-8999-900001000093';
const TN_HOST_4 = '99999999-9999-4999-8999-900001000094';
const HAKA_ID = '500000098';
const FIREBASE_UID = 'dev-state-ranking-host';
const COUNTRY = 'India';
const STATE_CODE = 'TN';

const STATE_TOTALS: Array<{ code: string; score: number }> = [
  { code: 'MH', score: 1_842_500 },
  { code: 'KA', score: 1_356_200 },
  { code: 'TN', score: 1_024_800 },
  { code: 'UP', score: 782_400 },
  { code: 'GJ', score: 645_100 },
  { code: 'WB', score: 518_600 },
  { code: 'RJ', score: 412_300 },
];

const TN_HOST_SCORES: Array<{ id: string; score: number }> = [
  { id: TN_HOST_1, score: 425_000 },
  { id: STATE_HOST_ID, score: 268_000 },
  { id: TN_HOST_3, score: 186_000 },
  { id: TN_HOST_4, score: 95_800 },
];

const COMPANION_HOSTS = [
  {
    id: TN_HOST_1,
    supabaseUid: 'dev-state-host-tn-1',
    username: 'lakshmi_tn',
    displayName: 'Lakshmi Venkat',
    hakaId: '500000091',
    avatar: 'https://i.pravatar.cc/150?u=lakshmi_tn',
  },
  {
    id: TN_HOST_3,
    supabaseUid: 'dev-state-host-tn-3',
    username: 'keerthi_tn',
    displayName: 'Keerthi Raj',
    hakaId: '500000093',
    avatar: 'https://i.pravatar.cc/150?u=keerthi_tn',
  },
  {
    id: TN_HOST_4,
    supabaseUid: 'dev-state-host-tn-4',
    username: 'nandini_tn',
    displayName: 'Nandini Pillai',
    hakaId: '500000094',
    avatar: 'https://i.pravatar.cc/150?u=nandini_tn',
  },
] as const;

async function seedStateRankingRedis(dateKey: string): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log('  (skip state ranking Redis: REDIS_URL unset)');
    return;
  }

  const redis = new Redis(url, {
    maxRetriesPerRequest: 2,
    lazyConnect: true,
    connectTimeout: 5_000,
    retryStrategy: () => null,
  });

  try {
    await redis.connect();
  } catch (e) {
    console.log('  (skip state ranking Redis: could not connect)', e);
    redis.disconnect();
    return;
  }

  try {
    const totalsKey = stateTotalsRedisKey('IN', dateKey);
    const pipe = redis.pipeline();
    pipe.del(totalsKey);
    for (const row of STATE_TOTALS) {
      pipe.zadd(totalsKey, row.score, row.code);
    }
    for (const row of STATE_TOTALS) {
      const hostsKey = stateHostsRedisKey('IN', row.code, dateKey);
      pipe.del(hostsKey);
      if (row.code === 'TN') {
        for (const host of TN_HOST_SCORES) {
          pipe.zadd(hostsKey, host.score, host.id);
        }
      } else {
        pipe.zadd(hostsKey, Math.floor(row.score * 0.4), `sr-${row.code.toLowerCase()}-h1`);
        pipe.zadd(hostsKey, Math.floor(row.score * 0.25), `sr-${row.code.toLowerCase()}-h2`);
      }
    }
    await pipe.exec();
    console.log(`  → Redis state boards seeded for ${dateKey} (IN, 7 states)`);
  } finally {
    redis.disconnect();
  }
}

async function main() {
  console.log('🌱 Seeding State Star female host (India / Tamil Nadu)...\n');

  const devPassword = process.env.DEV_LOGIN_PASSWORD ?? 'haka2024';
  const devPasswordHash = await bcrypt.hash(devPassword, 10);
  const dateKey = dailyDateKey();

  await prisma.user.upsert({
    where: { id: STATE_HOST_ID },
    update: {
      supabaseUid: FIREBASE_UID,
      password: devPasswordHash,
      role: 'host',
      hostType: 'independent',
      hostApplicationPath: 'self_apply_independent',
      gender: 'female',
      isVerifiedHost: true,
      faceVerificationStatus: 'approved',
      onboardingComplete: true,
      displayName: 'Priya Sharma',
      username: 'priya_tn',
      hakaId: HAKA_ID,
      avatar: 'https://i.pravatar.cc/150?u=priya_tn_state',
      country: COUNTRY,
      state: STATE_CODE,
      bio: 'Tamil Nadu host · State Star rankings dev seed',
    },
    create: {
      id: STATE_HOST_ID,
      supabaseUid: FIREBASE_UID,
      password: devPasswordHash,
      role: 'host',
      hostType: 'independent',
      hostApplicationPath: 'self_apply_independent',
      gender: 'female',
      isVerifiedHost: true,
      faceVerificationStatus: 'approved',
      onboardingComplete: true,
      displayName: 'Priya Sharma',
      username: 'priya_tn',
      hakaId: HAKA_ID,
      avatar: 'https://i.pravatar.cc/150?u=priya_tn_state',
      country: COUNTRY,
      state: STATE_CODE,
      bio: 'Tamil Nadu host · State Star rankings dev seed',
    },
  });

  await prisma.wallet.upsert({
    where: { userId: STATE_HOST_ID },
    update: { coinBalance: 25_000, beanBalance: 88_000 },
    create: { userId: STATE_HOST_ID, coinBalance: 25_000, beanBalance: 88_000 },
  });

  await prisma.userLevel.upsert({
    where: { userId: STATE_HOST_ID },
    update: { richLevel: 10, richXp: 62_000, charmLevel: 18, charmXp: 210_000 },
    create: {
      userId: STATE_HOST_ID,
      richLevel: 10,
      richXp: 62_000,
      charmLevel: 18,
      charmXp: 210_000,
    },
  });

  for (const host of COMPANION_HOSTS) {
    await prisma.user.upsert({
      where: { id: host.id },
      update: {
        gender: 'female',
        faceVerificationStatus: 'approved',
        role: 'host',
        country: COUNTRY,
        state: STATE_CODE,
        displayName: host.displayName,
      },
      create: {
        id: host.id,
        supabaseUid: host.supabaseUid,
        password: devPasswordHash,
        role: 'host',
        hostType: 'independent',
        hostApplicationPath: 'self_apply_independent',
        gender: 'female',
        faceVerificationStatus: 'approved',
        onboardingComplete: true,
        displayName: host.displayName,
        username: host.username,
        hakaId: host.hakaId,
        avatar: host.avatar,
        country: COUNTRY,
        state: STATE_CODE,
        bio: 'TN State Star companion seed host',
      },
    });
  }

  await seedStateRankingRedis(dateKey);

  console.log('\n✅ State ranking host seed complete!\n');
  console.log('════════════════════════════════════════════');
  console.log(`  Haka ID  : ${HAKA_ID}`);
  console.log(`  Password : ${devPassword}`);
  console.log('  Display  : Priya Sharma (@priya_tn)');
  console.log('  Role     : host (female, face verified)');
  console.log(`  Location : ${COUNTRY} · ${STATE_CODE} (Tamil Nadu)`);
  console.log('  Host rank: #2 in TN today (268,000 gift score)');
  console.log('  State rank: #3 Tamil Nadu on national board');
  console.log('  Login    : app → Login with Haka ID');
  console.log('  Tip      : set useMock=false + local API for live boards');
  console.log('════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('❌ State ranking host seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
