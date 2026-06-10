import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { seedRegionalEarnerRedisScores } from './seed-regional-earner-redis';

const prisma = new PrismaClient();

/** Must stay in sync with apps/backend/src/constants/haka-team.ts DEFAULT_HAKA_TEAM_USER_ID */
const SEED_HAKA_TEAM_USER_ID = 'f1111111-1111-4111-8111-111111111111';

/** Must stay in sync with apps/backend/src/constants/withdrawal-message.ts DEFAULT_WITHDRAWAL_MESSAGE_USER_ID */
const SEED_WITHDRAWAL_MESSAGE_USER_ID = 'f2222222-2222-4222-8222-222222222222';

const PUBLIC_HAKA_ID_SEQUENCE_NAME = 'public_haka_id_seq';
const HAKA_ID_LOCK_KEY = 1_746_000_001;
const MAX_ALLOCATION_ATTEMPTS = 50_000;

/** 9-digit public Haka ID (500000001 … 999999999). */
const publicHakaId = (n: number) => String(500_000_000 + n);

/** seed.ts reference users — block 500000014–500000019 (001–013 reserved for seed-testuser). */
const SEED_REFERENCE_HAKA_IDS: Record<string, string> = {
  seed_uid_agent_001: publicHakaId(14),
  seed_uid_host_001: publicHakaId(15),
  seed_uid_host_002: publicHakaId(16),
  seed_uid_user_001: publicHakaId(17),
  seed_uid_user_002: publicHakaId(18),
  seed_uid_user_003: publicHakaId(19),
};

async function ensureSeedReferenceHakaIds(): Promise<void> {
  for (const [supabaseUid, hakaId] of Object.entries(SEED_REFERENCE_HAKA_IDS)) {
    await prisma.user.updateMany({ where: { supabaseUid }, data: { hakaId } });
  }
}

async function generateUniqueHakaId(): Promise<string> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${HAKA_ID_LOCK_KEY})`;

    for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt++) {
      const rows = await tx.$queryRaw<{ next_val: bigint }[]>`
        SELECT nextval('"public_haka_id_seq"'::regclass)::bigint AS next_val
      `;
      const raw = rows[0]?.next_val;
      if (raw === undefined) throw new Error('generateUniqueHakaId: nextval returned no row');
      const candidate = typeof raw === 'bigint' ? raw.toString() : String(raw);

      const existing = await tx.user.findUnique({ where: { hakaId: candidate }, select: { id: true } });
      if (!existing) return candidate;
    }

    throw new Error('generateUniqueHakaId: exhausted allocation attempts');
  });
}

async function ensureUserHakaId(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { hakaId: true } });
  if (!u) return;
  if (u.hakaId) return;
  const hakaId = await generateUniqueHakaId();
  await prisma.user.update({ where: { id: userId }, data: { hakaId } });
}

/**
 * Geo + Redis regional earner demo (idempotent).
 * - Seed hosts get stable cities; Seed Agent gets London so `listLiveRooms` can show the city badge.
 * - Seed Room is hosted by Seed Agent so the home-feed card shows the top badge for that account.
 * - Redis: Seed Agent #1 in London daily/weekly/monthly; Seed Host 1 stays on the same shard with a lower score.
 */
async function ensureSeedHostsGeoAndRegionalEarnerRedis(): Promise<void> {
  const [agent, host1] = await Promise.all([
    prisma.user.findUnique({
      where: { supabaseUid: 'seed_uid_agent_001' },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: { supabaseUid: 'seed_uid_host_001' },
      select: { id: true },
    }),
  ]);
  if (!agent) return;

  await prisma.user.updateMany({
    where: { supabaseUid: 'seed_uid_host_001' },
    data: { country: 'GB', city: 'London' },
  });
  await prisma.user.updateMany({
    where: { supabaseUid: 'seed_uid_host_002' },
    data: { country: 'GB', city: 'Manchester' },
  });
  await prisma.user.update({
    where: { id: agent.id },
    data: { country: 'GB', city: 'London' },
  });

  const seedRoom = await prisma.room.findFirst({
    where: { title: 'Seed Room', status: 'live', type: 'public' },
    select: { id: true, hostId: true },
  });
  if (seedRoom && host1 && seedRoom.hostId === host1.id) {
    await prisma.room.update({
      where: { id: seedRoom.id },
      data: { hostId: agent.id },
    });
    await prisma.roomSeat.updateMany({
      where: { roomId: seedRoom.id, position: 1 },
      data: { userId: agent.id },
    });
    console.log('Seed Room host → Seed Agent 1 (regional top badge on home feed)');
  }

  const members: Array<{ userId: string; country: string; city: string; beans: number }> = [
    { userId: agent.id, country: 'GB', city: 'London', beans: 2_000_000 },
  ];
  if (host1) {
    members.push({ userId: host1.id, country: 'GB', city: 'London', beans: 1500 });
  }
  await seedRegionalEarnerRedisScores(members);
}

/** Demo agent `seed_uid_agent_001` must own an agency for bind-search / agency centre. Idempotent. */
/** System user for one-way Haka Team DMs — not a browsable profile. Idempotent. */
async function ensureHakaTeamUser() {
  await prisma.user.upsert({
    where: { supabaseUid: 'system_uid_haka_team' },
    update: {
      profileHidden: true,
      displayName: 'Haka Team',
      isActive: true,
    },
    create: {
      id: SEED_HAKA_TEAM_USER_ID,
      supabaseUid: 'system_uid_haka_team',
      displayName: 'Haka Team',
      username: null,
      role: 'normal_user',
      onboardingComplete: true,
      isActive: true,
      profileHidden: true,
    },
  });
  const ht = await prisma.user.findUnique({
    where: { supabaseUid: 'system_uid_haka_team' },
    select: { id: true, hakaId: true },
  });
  if (ht?.id) await ensureUserHakaId(ht.id);
  console.log('Ensured Haka Team system user for chat notifications');
}

/** System user for one-way Withdrawal Message DMs — not a browsable profile. Idempotent. */
async function ensureWithdrawalMessageUser() {
  await prisma.user.upsert({
    where: { supabaseUid: 'system_uid_withdrawal_message' },
    update: {
      profileHidden: true,
      displayName: 'Withdrawal Message',
      isActive: true,
    },
    create: {
      id: SEED_WITHDRAWAL_MESSAGE_USER_ID,
      supabaseUid: 'system_uid_withdrawal_message',
      displayName: 'Withdrawal Message',
      username: null,
      role: 'normal_user',
      onboardingComplete: true,
      isActive: true,
      profileHidden: true,
    },
  });
  const wm = await prisma.user.findUnique({
    where: { supabaseUid: 'system_uid_withdrawal_message' },
    select: { id: true, hakaId: true },
  });
  if (wm?.id) await ensureUserHakaId(wm.id);
  console.log('Ensured Withdrawal Message system user for chat notifications');
}

async function ensureSeedAgentAgency() {
  const agent = await prisma.user.findUnique({
    where: { supabaseUid: 'seed_uid_agent_001' },
    select: { id: true, role: true, displayName: true },
  });
  if (!agent || agent.role !== 'agent') return;

  if (agent.displayName === 'Seed Agent') {
    await prisma.user.update({ where: { id: agent.id }, data: { displayName: 'Seed Agent 1' } });
  }

  const owned = await prisma.agency.findUnique({ where: { ownerId: agent.id } });
  if (owned) return;

  await prisma.agency.create({
    data: {
      name: 'Seed Agency',
      ownerId: agent.id,
      status: 'active',
      description: 'Demo agency seeded for local development',
    },
  });
  console.log('Ensured agency for Seed Agent 1 (supabaseUid seed_uid_agent_001)');
}

const GIFTS = [
  // Basic gifts — beanValue now matches coinCost; distribution math applies the 70% once.
  { name: 'Rose',        icon: '🌹', image: null, svgaAsset: null, coinCost: 10,     beanValue: 10,     category: 'bag',   animationType: '',           soundKey: '',        order: 0  },
  { name: 'Heart',       icon: '❤️', image: null, svgaAsset: null, coinCost: 50,     beanValue: 50,     category: 'bag',   animationType: '',           soundKey: '',        order: 1  },
  { name: 'Lollipop',    icon: '🍭', image: null, svgaAsset: null, coinCost: 99,     beanValue: 99,     category: 'bag',   animationType: '',           soundKey: '',        order: 2  },
  { name: 'Ice Cream',   icon: '🍦', image: null, svgaAsset: null, coinCost: 199,    beanValue: 199,    category: 'bag',   animationType: '',           soundKey: '',        order: 3  },
  { name: 'Teddy Bear',  icon: '🧸', image: null, svgaAsset: null, coinCost: 299,    beanValue: 299,    category: 'bag',   animationType: '',           soundKey: '',        order: 4  },

  // Premium gifts (emoji + sound)
  { name: 'Fireworks',   icon: '🎆', image: null, svgaAsset: null, coinCost: 500,    beanValue: 500,    category: 'hot', animationType: '',           soundKey: 'fanfare', order: 5  },
  { name: 'Crown',       icon: '👑', image: null, svgaAsset: null, coinCost: 1_000,  beanValue: 1_000,  category: 'hot', animationType: '',           soundKey: 'sparkle', order: 6  },
  { name: 'Diamond',     icon: '💎', image: null, svgaAsset: null, coinCost: 2_000,  beanValue: 2_000,  category: 'hot', animationType: '',           soundKey: 'sparkle', order: 7  },
  { name: 'Rocket',      icon: '🚀', image: null, svgaAsset: null, coinCost: 5_000,  beanValue: 5_000,  category: 'hot', animationType: '',           soundKey: 'boom',    order: 8  },

  // Special gifts (SVGA animation + thumbnail)
  { name: 'Love Ride',     icon: '💕', image: 'gifts/86.png',  svgaAsset: 'gifts/86.svga',  coinCost: 9_999,  beanValue: 9_999,  category: 'lucky', animationType: 'svga', soundKey: 'fanfare', order: 9  },
  { name: 'Golden Palace', icon: '🕌', image: 'gifts/93.png',  svgaAsset: 'gifts/93.svga',  coinCost: 15_000, beanValue: 15_000, category: 'lucky', animationType: 'svga', soundKey: 'fanfare', order: 10 },
  { name: 'Moonlight',     icon: '🌙', image: 'gifts/116.png', svgaAsset: 'gifts/116.svga', coinCost: 25_000, beanValue: 25_000, category: 'lucky', animationType: 'svga', soundKey: 'sparkle', order: 11 },
  { name: 'Magic Lamp',    icon: '🧞', image: 'gifts/121.png', svgaAsset: 'gifts/121.svga', coinCost: 50_000, beanValue: 50_000, category: 'lucky', animationType: 'svga', soundKey: 'boom',    order: 12 },
];

async function main() {
  // ── Admin user ───────────────────────────────────────────────────────────────
  // Seed a default super admin if none exist (for local/dev only).
  const adminCount = await prisma.adminUser.count();
  if (adminCount === 0) {
    const email = process.env.ADMIN_INITIAL_EMAIL || 'admin@hakalive.com';
    const password = process.env.ADMIN_INITIAL_PASSWORD || 'admin1234';
    const displayName = 'Super Admin';

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.adminUser.create({
      data: {
        email,
        passwordHash,
        displayName,
        role: 'super_admin',
      },
    });

    console.log(`Created super_admin: ${email}`);
  }

  console.log('Seeding gifts...');

  const giftCount = await prisma.gift.count();
  if (giftCount === 0) {
    await prisma.gift.createMany({ data: GIFTS });
    console.log(`Created ${GIFTS.length} gifts (${GIFTS.filter(g => g.svgaAsset).length} with SVGA animations)`);
  } else {
    console.log(`Gifts already exist (${giftCount}), skipping`);
  }
  console.log('Seed complete');

  // Seed default agency tiers if none exist.
  // minHostIncome is BigInt — pass JS bigint literals.
  const tierCount = await prisma.agencyTier.count();
  if (tierCount === 0) {
    await prisma.agencyTier.createMany({
      data: [
        { name: 'A', minHostIncome: 0n, commissionRate: 0.04, order: 0 },
        { name: 'B', minHostIncome: 2_000_000n, commissionRate: 0.08, order: 1 },
        { name: 'C', minHostIncome: 10_000_000n, commissionRate: 0.12, order: 2 },
        { name: 'D', minHostIncome: 50_000_000n, commissionRate: 0.16, order: 3 },
        { name: 'E', minHostIncome: 150_000_000n, commissionRate: 0.20, order: 4 },
      ],
    });
    console.log('Seeded agency tiers A–E');
  }

  // Ensure the gift-bonus singleton exists — the migration already inserted it,
  // but re-running `prisma db seed` against a fresh DB should still work.
  await prisma.giftBonusSetting.upsert({
    where: { id: 'singleton' },
    update: { enabled: true },
    create: { id: 'singleton', enabled: true, bonusRate: 0.15, updatedBy: '' },
  });
  console.log('Ensured gift bonus singleton');

  const giftBonusTierCount = await prisma.giftBonusTier.count();
  if (giftBonusTierCount === 0) {
    await prisma.giftBonusTier.createMany({
      data: [
        { name: 'Tier1', minRollingIncome: 0n, bonusRate: 0, order: 0 },
        { name: 'Tier2', minRollingIncome: 200_000n, bonusRate: 0.05, order: 1 },
        { name: 'Tier3', minRollingIncome: 300_000n, bonusRate: 0.10, order: 2 },
        { name: 'Tier4', minRollingIncome: 500_000n, bonusRate: 0.15, order: 3 },
      ],
    });
    console.log('Seeded gift bonus tiers (0%–15% rolling thresholds)');
  }

  // ── Demo users + wallets + agency + room ────────────────────────────────────
  // Uses deterministic fake Supabase UIDs so the mobile app can reference users
  // in the DB for UI/testing without needing real Supabase identities.
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    const agent = await prisma.user.upsert({
      where: { supabaseUid: 'seed_uid_agent_001' },
      update: { displayName: 'Seed Agent 1' },
      create: {
        supabaseUid: 'seed_uid_agent_001',
        hakaId: SEED_REFERENCE_HAKA_IDS['seed_uid_agent_001'],
        displayName: 'Seed Agent 1',
        username: 'seed_agent',
        role: 'agent',
        onboardingComplete: true,
        isActive: true,
      },
    });

    const host1 = await prisma.user.upsert({
      where: { supabaseUid: 'seed_uid_host_001' },
      update: {},
      create: {
        supabaseUid: 'seed_uid_host_001',
        hakaId: SEED_REFERENCE_HAKA_IDS['seed_uid_host_001'],
        displayName: 'Seed Host 1',
        username: 'seed_host_1',
        role: 'host',
        hostType: 'agent_host',
        hostApplicationPath: 'agency_invitation',
        agentId: agent.id,
        onboardingComplete: true,
        isActive: true,
        isVerifiedHost: true,
        country: 'GB',
        city: 'London',
      },
    });

    const host2 = await prisma.user.upsert({
      where: { supabaseUid: 'seed_uid_host_002' },
      update: {},
      create: {
        supabaseUid: 'seed_uid_host_002',
        hakaId: SEED_REFERENCE_HAKA_IDS['seed_uid_host_002'],
        displayName: 'Seed Host 2',
        username: 'seed_host_2',
        role: 'host',
        hostType: 'agent_host',
        hostApplicationPath: 'self_apply_with_agent',
        agentId: agent.id,
        onboardingComplete: true,
        isActive: true,
        country: 'GB',
        city: 'Manchester',
      },
    });

    const user1 = await prisma.user.upsert({
      where: { supabaseUid: 'seed_uid_user_001' },
      update: {},
      create: {
        supabaseUid: 'seed_uid_user_001',
        hakaId: SEED_REFERENCE_HAKA_IDS['seed_uid_user_001'],
        displayName: 'Seed User 1',
        username: 'seed_user_1',
        role: 'normal_user',
        onboardingComplete: true,
        isActive: true,
      },
    });

    const user2 = await prisma.user.upsert({
      where: { supabaseUid: 'seed_uid_user_002' },
      update: {},
      create: {
        supabaseUid: 'seed_uid_user_002',
        hakaId: SEED_REFERENCE_HAKA_IDS['seed_uid_user_002'],
        displayName: 'Seed User 2',
        username: 'seed_user_2',
        role: 'normal_user',
        onboardingComplete: true,
        isActive: true,
      },
    });

    const user3 = await prisma.user.upsert({
      where: { supabaseUid: 'seed_uid_user_003' },
      update: {},
      create: {
        supabaseUid: 'seed_uid_user_003',
        hakaId: SEED_REFERENCE_HAKA_IDS['seed_uid_user_003'],
        displayName: 'Seed User 3',
        username: 'seed_user_3',
        role: 'normal_user',
        onboardingComplete: true,
        isActive: true,
      },
    });

    // Wallets for each seeded user.
    const users = [agent, host1, host2, user1, user2, user3];
    for (const u of users) {
      await prisma.wallet.upsert({
        where: { userId: u.id },
        update: {},
        create: {
          userId: u.id,
          coinBalance: u.role === 'agent' ? 500_000 : 25_000,
          beanBalance: u.role === 'host' ? 10_000 : 0,
        },
      });
    }

    // Create an agency owned by this seed agent (not merely "any" agency in DB).
    let agency = await prisma.agency.findUnique({ where: { ownerId: agent.id } });
    if (!agency) {
      agency = await prisma.agency.create({
        data: {
          name: 'Seed Agency',
          ownerId: agent.id,
          status: 'active',
          description: 'Demo agency seeded for local development',
        },
      });
    }

    // Demo room hosted by Seed Agent so regional earner badge (daily London #1) appears on the feed.
    const room = await prisma.room.create({
      data: {
        hostId: agent.id,
        title: 'Seed Room',
        description: 'Demo room seeded for local development',
        type: 'public',
        status: 'live',
        roomMode: 'chat',
        micConfig: 5,
        agoraChannel: `seed_room_${agent.id}`,
        viewerCount: 3,
        startedAt: new Date(),
      },
    });

    await prisma.roomSeat.createMany({
      data: [
        { roomId: room.id, position: 1, userId: agent.id, isLocked: false, isMuted: false },
        { roomId: room.id, position: 2, userId: user1.id, isLocked: false, isMuted: false },
        { roomId: room.id, position: 3, userId: user2.id, isLocked: false, isMuted: true },
        { roomId: room.id, position: 4, userId: null, isLocked: false, isMuted: false },
        { roomId: room.id, position: 5, userId: null, isLocked: false, isMuted: false },
      ],
      skipDuplicates: true,
    });

    console.log(
      `Seeded demo users (${users.length}), 1 agency (${agency.id}), 1 room (${room.id}) with seats`
    );
  } else {
    await ensureSeedReferenceHakaIds();
  }

  // ── Store items ──────────────────────────────────────────────────────────────
  const storeCount = await prisma.storeItem.count();
  if (storeCount === 0) {
    await prisma.storeItem.createMany({
      data: [
        // Profile Frames (SVGA animated)
        { name: 'Gold Frame',       description: 'Premium gold profile frame',        category: 'frame',   image: 'store/frames/1.svga',  coinCost: 500,   durationDays: 30,  sortOrder: 1 },
        { name: 'Diamond Frame',    description: 'Sparkling diamond profile frame',   category: 'frame',   image: 'store/frames/2.svga',  coinCost: 1500,  durationDays: 30,  sortOrder: 2 },
        { name: 'Neon Frame',       description: 'Glowing neon profile frame',        category: 'frame',   image: 'store/frames/36.svga', coinCost: 800,   durationDays: 30,  sortOrder: 3 },
        { name: 'Royal Frame',      description: 'Elegant royal profile frame',       category: 'frame',   image: 'store/frames/67.svga', coinCost: 2000,  durationDays: 0,   sortOrder: 4 },
        { name: 'Mystic Frame',     description: 'Mystic aura profile frame',         category: 'frame',   image: 'store/frames/68.svga', coinCost: 3000,  durationDays: 0,   sortOrder: 5 },

        // Special IDs (SVGA animated) — level determines rarity/price
        { name: 'SSS Special ID',   description: 'SSS-tier animated special ID',    category: 'special_id', image: 'store/special-ids/SSS.svga', level: 'SSS', coinCost: 8000, durationDays: 0,  sortOrder: 1 },
        { name: 'SS Special ID',    description: 'SS-tier animated special ID',     category: 'special_id', image: 'store/special-ids/SS.svga',  level: 'SS',  coinCost: 5000, durationDays: 0,  sortOrder: 2 },
        { name: 'S Special ID',     description: 'S-tier animated special ID',      category: 'special_id', image: 'store/special-ids/S.svga',   level: 'S',   coinCost: 3500, durationDays: 30, sortOrder: 3 },
        { name: 'A Special ID',     description: 'A-tier animated special ID',      category: 'special_id', image: 'store/special-ids/A.svga',   level: 'A',   coinCost: 2000, durationDays: 30, sortOrder: 4 },
        { name: 'B Special ID',     description: 'B-tier animated special ID',      category: 'special_id', image: 'store/special-ids/B.svga',   level: 'B',   coinCost: 1000, durationDays: 30, sortOrder: 5 },

        // Room Entry Effects
        { name: 'Firework Entry',   description: 'Firework explosion room entry',     category: 'entry',      coinCost: 1000,  durationDays: 30,  sortOrder: 1 },
        { name: 'Galaxy Entry',     description: 'Galaxy swirl room entry effect',    category: 'entry',      coinCost: 2500,  durationDays: 30,  sortOrder: 2 },
        { name: 'Dragon Entry',     description: 'Dragon swoosh room entry',          category: 'entry',      coinCost: 5000,  durationDays: 30,  sortOrder: 3 },

        // Chat Bubbles
        { name: 'Pink Bubble',      description: 'Pink gradient chat bubble',         category: 'chat_bubble',     coinCost: 300,   durationDays: 30,  sortOrder: 1 },
        { name: 'Blue Bubble',      description: 'Ocean blue chat bubble',            category: 'chat_bubble',     coinCost: 300,   durationDays: 30,  sortOrder: 2 },
        { name: 'Gold Bubble',      description: 'Luxury gold chat bubble',           category: 'chat_bubble',     coinCost: 800,   durationDays: 30,  sortOrder: 3 },

        // Mic Voice Waves
        { name: 'Rainbow Wave',     description: 'Rainbow mic voice wave effect',     category: 'mic_voice_wave',  coinCost: 600,   durationDays: 30,  sortOrder: 1 },
        { name: 'Neon Wave',        description: 'Neon pulsing voice wave',           category: 'mic_voice_wave',  coinCost: 1200,  durationDays: 30,  sortOrder: 2 },

        // Dynamic Profiles
        { name: 'Starry Night',     description: 'Animated starry night background',  category: 'dynamic_profile', coinCost: 1000,  durationDays: 30,  sortOrder: 1 },
        { name: 'Ocean Waves',      description: 'Animated ocean waves background',   category: 'dynamic_profile', coinCost: 1000,  durationDays: 30,  sortOrder: 2 },
        { name: 'Aurora',           description: 'Northern lights animated profile',  category: 'dynamic_profile', coinCost: 3000,  durationDays: 0,   sortOrder: 3 },

        // Entry Tags
        { name: 'VIP Tag',          description: 'VIP entry room tag',                category: 'entry_tag',       coinCost: 400,   durationDays: 30,  sortOrder: 1 },
        { name: 'Star Tag',         description: 'Star entry room tag',               category: 'entry_tag',       coinCost: 600,   durationDays: 30,  sortOrder: 2 },
        { name: 'Legend Tag',       description: 'Legend entry room tag',             category: 'entry_tag',       coinCost: 2000,  durationDays: 0,   sortOrder: 3 },

        // Rings
        { name: 'Gold Ring',        description: 'Gold avatar ring effect',           category: 'ring',            coinCost: 700,   durationDays: 30,  sortOrder: 1 },
        { name: 'Diamond Ring',     description: 'Diamond sparkling avatar ring',     category: 'ring',            coinCost: 2000,  durationDays: 30,  sortOrder: 2 },
        { name: 'Flame Ring',       description: 'Burning flame avatar ring',         category: 'ring',            coinCost: 1500,  durationDays: 30,  sortOrder: 3 },
      ],
    });
    console.log('Seeded store items');
  }

  // ── Theme store items + linked Theme rows ────────────────────────────────────
  // `seed-themes.ts` also seeds these, but `prisma db seed` only runs this file.
  // Ensure at least one theme exists so the Store → Theme category isn't empty.
  const existingThemeStoreItem = await prisma.storeItem.findFirst({
    where: { category: 'theme', isActive: true },
    select: { id: true },
  });

  if (!existingThemeStoreItem) {
    const themeItem = await prisma.storeItem.create({
      data: {
        name: 'Rose Gold Theme',
        description: 'Apply the Rose Gold theme to your room',
        category: 'theme',
        coinCost: 500,
        durationDays: 0,
        sortOrder: 1,
        isActive: true,
      },
      select: { id: true },
    });

    await prisma.theme.create({
      data: {
        name: 'Rose Gold',
        gradientFrom: '#2C1215',
        gradientTo: '#4A1E24',
        accentColor: '#E8748A',
        chatBubbleColor: '#4A1E24',
        storeItemId: themeItem.id,
      },
    });

    console.log('Seeded theme store item + theme');
  }

  // ── Special IDs ─────────────────────────────────────────────────────────────
  const specialIdCount = await prisma.specialId.count();
  if (specialIdCount === 0) {
    await prisma.specialId.createMany({
      data: [
        // SSS tier — premium vanity numbers
        { number: '888888', price: 50000, durationDays: 90, level: 'SSS', status: 'available' },
        { number: '666666', price: 50000, durationDays: 90, level: 'SSS', status: 'available' },
        { number: '999999', price: 50000, durationDays: 90, level: 'SSS', status: 'available' },
        { number: '111111', price: 45000, durationDays: 90, level: 'SSS', status: 'available' },
        { number: '777777', price: 45000, durationDays: 90, level: 'SSS', status: 'available' },

        // SS tier — repeating patterns
        { number: '123456', price: 25000, durationDays: 60, level: 'SS', status: 'available' },
        { number: '654321', price: 25000, durationDays: 60, level: 'SS', status: 'available' },
        { number: '112233', price: 20000, durationDays: 60, level: 'SS', status: 'available' },
        { number: '998877', price: 20000, durationDays: 60, level: 'SS', status: 'available' },
        { number: '556677', price: 18000, durationDays: 60, level: 'SS', status: 'available' },
        { number: '101010', price: 18000, durationDays: 60, level: 'SS', status: 'available' },

        // S tier — nice numbers
        { number: '500500', price: 10000, durationDays: 30, level: 'S', status: 'available' },
        { number: '200200', price: 10000, durationDays: 30, level: 'S', status: 'available' },
        { number: '168168', price: 12000, durationDays: 30, level: 'S', status: 'available' },
        { number: '520520', price: 12000, durationDays: 30, level: 'S', status: 'available' },
        { number: '314159', price: 8000,  durationDays: 30, level: 'S', status: 'available' },
        { number: '786786', price: 9000,  durationDays: 30, level: 'S', status: 'available' },
        { number: '300300', price: 8000,  durationDays: 30, level: 'S', status: 'available' },
        { number: '700700', price: 8000,  durationDays: 30, level: 'S', status: 'available' },

        // A tier — decent numbers
        { number: '150150', price: 5000, durationDays: 30, level: 'A', status: 'available' },
        { number: '250250', price: 5000, durationDays: 30, level: 'A', status: 'available' },
        { number: '369369', price: 4500, durationDays: 30, level: 'A', status: 'available' },
        { number: '420420', price: 4500, durationDays: 30, level: 'A', status: 'available' },
        { number: '808080', price: 4000, durationDays: 30, level: 'A', status: 'available' },
        { number: '919191', price: 4000, durationDays: 30, level: 'A', status: 'available' },
        { number: '135790', price: 3500, durationDays: 30, level: 'A', status: 'available' },
        { number: '246802', price: 3500, durationDays: 30, level: 'A', status: 'available' },
        { number: '753159', price: 3500, durationDays: 30, level: 'A', status: 'available' },
        { number: '852963', price: 3500, durationDays: 30, level: 'A', status: 'available' },

        // B tier — standard numbers
        { number: '481632', price: 2000, durationDays: 30, level: 'B', status: 'available' },
        { number: '571428', price: 2000, durationDays: 30, level: 'B', status: 'available' },
        { number: '162534', price: 1500, durationDays: 30, level: 'B', status: 'available' },
        { number: '273645', price: 1500, durationDays: 30, level: 'B', status: 'available' },
        { number: '384756', price: 1500, durationDays: 30, level: 'B', status: 'available' },
        { number: '495867', price: 1500, durationDays: 30, level: 'B', status: 'available' },
        { number: '516273', price: 1000, durationDays: 30, level: 'B', status: 'available' },
        { number: '627384', price: 1000, durationDays: 30, level: 'B', status: 'available' },
        { number: '738495', price: 1000, durationDays: 30, level: 'B', status: 'available' },
        { number: '849506', price: 1000, durationDays: 30, level: 'B', status: 'available' },
      ],
    });
    console.log('Seeded 40 Special IDs (SSS: 5, SS: 6, S: 8, A: 10, B: 10, status: available)');
  }

  // ── Coin seller level rules ──────────────────────────────────────────────────
  const ruleCount = await prisma.coinSellerLevelRule.count();
  if (ruleCount === 0) {
    await prisma.coinSellerLevelRule.createMany({
      data: [
        {
          levelName: 'Bronze',
          exchangeLimit: '50,000 coins/day',
          sellerToUserRate: '1:1',
          userToSellerRate: '1:1',
          sellerListRule: 'Visible to all users',
          coinSellingListRule: 'Standard listing',
          sortOrder: 1,
        },
        {
          levelName: 'Silver',
          exchangeLimit: '200,000 coins/day',
          sellerToUserRate: '1:1',
          userToSellerRate: '1:1',
          sellerListRule: 'Priority listing',
          coinSellingListRule: 'Featured listing',
          sortOrder: 2,
        },
        {
          levelName: 'Gold',
          exchangeLimit: '500,000 coins/day',
          sellerToUserRate: '1:1',
          userToSellerRate: '1:1',
          sellerListRule: 'Top listing with badge',
          coinSellingListRule: 'Premium listing with badge',
          sortOrder: 3,
        },
        {
          levelName: 'Diamond',
          exchangeLimit: 'Unlimited',
          sellerToUserRate: '1:1',
          userToSellerRate: '1:1',
          sellerListRule: 'Exclusive top listing',
          coinSellingListRule: 'Exclusive premium listing',
          sortOrder: 4,
        },
      ],
    });
    console.log('Seeded coin seller level rules');
  }

  // ── Host centre defaults (admin can override in system settings) ───────────
  await prisma.systemSetting.upsert({
    where: { key: 'host_mic_daily_target_minutes' },
    create: { key: 'host_mic_daily_target_minutes', value: '120' },
    update: {},
  });
  await prisma.systemSetting.upsert({
    where: { key: 'host_daily_points_target' },
    create: { key: 'host_daily_points_target', value: '5000' },
    update: {},
  });

  // ── Payments: direct user top-up gate + seller recharge company addresses ──
  await prisma.systemSetting.upsert({
    where: { key: 'payments.direct_user_topup_enabled' },
    create: { key: 'payments.direct_user_topup_enabled', value: false },
    update: {},
  });
  await prisma.systemSetting.upsert({
    where: { key: 'coin_seller_epay' },
    create: { key: 'coin_seller_epay', value: 'payments@haka-live.example' },
    update: {},
  });
  await prisma.systemSetting.upsert({
    where: { key: 'coin_seller_usdt_trc20' },
    create: { key: 'coin_seller_usdt_trc20', value: 'TExampleTrc20AddressPlaceholder' },
    update: {},
  });
  await prisma.systemSetting.upsert({
    where: { key: 'coin_seller_usdt_bep20' },
    create: { key: 'coin_seller_usdt_bep20', value: '0xExampleBep20AddressPlaceholder' },
    update: {},
  });

  await ensureHakaTeamUser();
  await ensureWithdrawalMessageUser();
  await ensureSeedAgentAgency();
  await ensureSeedHostsGeoAndRegionalEarnerRedis();
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
