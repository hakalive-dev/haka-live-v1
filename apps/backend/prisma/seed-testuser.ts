/**
 * Test-user seed — creates the primary tester account + supporting cast.
 *
 * Run (while docker services are up):
 *   docker compose -f docker-compose.dev.yml exec backend \
 *     npx ts-node prisma/seed-testuser.ts
 *
 * ── Credentials ───────────────────────────────────────────────────────────────
 *   Haka ID : 500000001  (9-digit public IDs; reserved block 500000001–500000013)
 *   Password: DEV_LOGIN_PASSWORD from .env (default haka2024)
 *
 * Seeded users use DB bcrypt passwords only — no Firebase/Supabase Auth required for Haka ID login.
 *
 * Safe to re-run: upserts throughout, no duplicates.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ── Fixed IDs (real UUIDs for users so they align with `@default(uuid())`) ──

const ME = '11111111-1111-4111-8111-100001000001';         // the tester (JjayFabor)

const SUPPORTERS = {
  yuki:   '22222222-2222-4222-8222-200001000001',
  aisha:  '22222222-2222-4222-8222-200002000002',
  kai:    '22222222-2222-4222-8222-200003000003',
  sara:   '22222222-2222-4222-8222-200004000004',
  leo:    '22222222-2222-4222-8222-200005000005',
  mia:    '22222222-2222-4222-8222-200006000006',
};

const ROOM_ID   = '300001';
const FAMILY_ID = '400001';

// Extra live hosts for testing gift-send flow
const LIVE_HOSTS = {
  nova:   { id: '66666666-6666-4666-8666-600001000001', roomId: '610001' },
  zara:   { id: '66666666-6666-4666-8666-600002000002', roomId: '610002' },
  marco:  { id: '66666666-6666-4666-8666-600003000003', roomId: '610003' },
};

// ── Role-specific test accounts (each loginable via dev-login-haka) ──────────
const ROLE_ACCOUNTS = {
  agent:      { id: '77777777-7777-4777-8777-700001000001', agencyId: '710001' },
  agentHost:  { id: '77777777-7777-4777-8777-700002000002' },
  normalUser: { id: '77777777-7777-4777-8777-700003000003' },
};

/** Verified female host — opens FemaleHostTaskScreen (level tasks + Reward routing). */
const FEMALE_HOST = '88888888-8888-4888-8888-800001000001';

const MOMENTS = {
  m1: '500001',
  m2: '500002',
  m3: '500003',
  v1: '500004',
  v2: '500005',
};

/** 9-digit public Haka ID from sequence block (500000001 … 999999999). */
const publicHakaId = (n: number) => String(500_000_000 + n);

// Test cast: 500000001–500000013 (run before / after other seeds; upserts fix hakaId on re-run).
const HAKA_IDS = {
  me:         publicHakaId(1),
  yuki:       publicHakaId(2),
  aisha:      publicHakaId(3),
  kai:        publicHakaId(4),
  sara:       publicHakaId(5),
  leo:        publicHakaId(6),
  mia:        publicHakaId(7),
  nova:       publicHakaId(8),
  zara:       publicHakaId(9),
  marco:      publicHakaId(10),
  agent:      publicHakaId(11),
  agentHost:  publicHakaId(12),
  normalUser: publicHakaId(13),
  femaleHost: '500000099',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

async function main() {
  console.log('🌱 Seeding test user...\n');

  const devPassword = process.env.DEV_LOGIN_PASSWORD ?? 'haka2024';
  const devPasswordHash = await bcrypt.hash(devPassword, 10);

  // ── 0. Clean up stale test records (old IDs from previous seed runs) ─────────
  const ALL_FIREBASE_UIDS = [
    'dev-test-jjayfabor',
    'dev-supp-yuki', 'dev-supp-aisha', 'dev-supp-kai',
    'dev-supp-sara', 'dev-supp-leo',   'dev-supp-mia',
    'dev-host-nova', 'dev-host-zara',  'dev-host-marco',
    'dev-role-agent', 'dev-role-agenthost', 'dev-role-normal',
    'dev-female-host',
  ];
  const stale = await prisma.user.findMany({
    where: { supabaseUid: { in: ALL_FIREBASE_UIDS }, NOT: { id: { in: [ME, ...Object.values(SUPPORTERS), ...Object.values(LIVE_HOSTS).map(h => h.id), ...Object.values(ROLE_ACCOUNTS).map(r => 'id' in r ? r.id : '')] } } },
    select: { id: true },
  });
  if (stale.length > 0) {
    console.log(`→ Removing ${stale.length} stale test user(s) from previous seed...`);
    const staleIds = stale.map((u) => u.id);
    // Clear nullable self-reference (agent hosts pointing to stale agents)
    await prisma.user.updateMany({ where: { agentId: { in: staleIds } }, data: { agentId: null } });
    // Delete records with non-cascading FKs to User, in dependency order
    await prisma.agentTransaction.deleteMany({ where: { OR: [{ agentId: { in: staleIds } }, { customerId: { in: staleIds } }] } });
    await prisma.hostApplication.deleteMany({ where: { OR: [{ userId: { in: staleIds } }, { agentId: { in: staleIds } }] } });
    await prisma.accountRisk.deleteMany({ where: { userId: { in: staleIds } } });
    await prisma.userTag.deleteMany({ where: { OR: [{ userId: { in: staleIds } }, { assignedBy: { in: staleIds } }] } });
    await prisma.inviteCode.updateMany({ where: { inviteeId: { in: staleIds } }, data: { inviteeId: null } });
    await prisma.inviteCode.deleteMany({ where: { inviterId: { in: staleIds } } });
    await prisma.room.deleteMany({ where: { hostId: { in: staleIds } } });
    await prisma.family.deleteMany({ where: { ownerId: { in: staleIds } } });
    await prisma.agency.deleteMany({ where: { ownerId: { in: staleIds } } });
    await prisma.user.deleteMany({ where: { id: { in: staleIds } } });
  }

  // ── 1. Main tester user ─────────────────────────────────────────────────────
  console.log('→ Creating tester account (JJAY001)...');
  await prisma.user.upsert({
    where: { id: ME },
    update: {
      supabaseUid: 'dev-test-jjayfabor',
      username:    'jjayfabor',
      displayName: 'JjayFabor',
      hakaId:      HAKA_IDS.me,
      password:    devPasswordHash,
      role:        'host',
      hostType:    'independent',
      hostApplicationPath: 'self_apply_independent',
      onboardingComplete:  true,
      avatar:  'https://i.pravatar.cc/150?u=jjayfabor',
      country: 'PH',
      bio:     'Official test account · Haka Live Dev 🔥',
    },
    create: {
      id: ME,
      supabaseUid: 'dev-test-jjayfabor',
      password:    devPasswordHash,
      username:    'jjayfabor',
      displayName: 'JjayFabor',
      hakaId:      HAKA_IDS.me,
      role:        'host',
      hostType:    'independent',
      hostApplicationPath: 'self_apply_independent',
      onboardingComplete:  true,
      avatar:  'https://i.pravatar.cc/150?u=jjayfabor',
      country: 'PH',
      bio:     'Official test account · Haka Live Dev 🔥',
    },
  });

  // ── 2. Supporter users ──────────────────────────────────────────────────────
  console.log('→ Creating supporter users...');
  const supporters = [
    { id: SUPPORTERS.yuki,  supabaseUid: 'dev-supp-yuki',  username: 'ts_yuki',   displayName: 'Yuki Tanaka',  hakaId: HAKA_IDS.yuki,  avatar: 'https://i.pravatar.cc/150?u=ts_yuki',  country: 'JP', role: 'host',        hostType: 'agent_host',  hostApplicationPath: 'self_apply_with_agent' },
    { id: SUPPORTERS.aisha, supabaseUid: 'dev-supp-aisha', username: 'ts_aisha',  displayName: 'Aisha Malik',  hakaId: HAKA_IDS.aisha, avatar: 'https://i.pravatar.cc/150?u=ts_aisha', country: 'PK', role: 'normal_user', hostType: '',            hostApplicationPath: '' },
    { id: SUPPORTERS.kai,   supabaseUid: 'dev-supp-kai',   username: 'ts_kai',    displayName: 'Kai Rivera',   hakaId: HAKA_IDS.kai,   avatar: 'https://i.pravatar.cc/150?u=ts_kai',   country: 'US', role: 'normal_user', hostType: '',            hostApplicationPath: '' },
    { id: SUPPORTERS.sara,  supabaseUid: 'dev-supp-sara',  username: 'ts_sara',   displayName: 'Sara Lin',     hakaId: HAKA_IDS.sara,  avatar: 'https://i.pravatar.cc/150?u=ts_sara',  country: 'CN', role: 'normal_user', hostType: '',            hostApplicationPath: '' },
    { id: SUPPORTERS.leo,   supabaseUid: 'dev-supp-leo',   username: 'ts_leo',    displayName: 'Leo Stone',    hakaId: HAKA_IDS.leo,   avatar: 'https://i.pravatar.cc/150?u=ts_leo',   country: 'GB', role: 'normal_user', hostType: '',            hostApplicationPath: '' },
    { id: SUPPORTERS.mia,   supabaseUid: 'dev-supp-mia',   username: 'ts_mia',    displayName: 'Mia Chen',     hakaId: HAKA_IDS.mia,   avatar: 'https://i.pravatar.cc/150?u=ts_mia',   country: 'SG', role: 'normal_user', hostType: '',            hostApplicationPath: '' },
  ];

  for (const s of supporters) {
    await prisma.user.upsert({
      where: { id: s.id },
      update: { password: devPasswordHash },
      create: {
        id: s.id,
        supabaseUid: s.supabaseUid,
        password: devPasswordHash,
        username: s.username,
        displayName: s.displayName,
        hakaId: s.hakaId,
        role: s.role,
        hostType: s.hostType,
        hostApplicationPath: s.hostApplicationPath,
        onboardingComplete: true,
        avatar: s.avatar,
        country: s.country,
        bio: `Hi, I'm ${s.displayName}!`,
      },
    });
  }

  // ── 3. Coin Seller profile — tester ─────────────────────────────────────────
  console.log('→ Attaching CoinSellerProfile to tester...');
  await prisma.coinSellerProfile.upsert({
    where: { userId: ME },
    create: {
      userId:         ME,
      whatsappNumber: '+639171234567',
      sellerLevel:    'Gold',
      paymentMethods: 'upi,epay,usdt,usdc',
      pricePerCoin:   0.0010,
      countryCode:    'PH',
      availableBalance: 1_000_000,
      totalBalance:     5_000_000,
      totalCoinsSold:   500_000,
      totalCustomers:   120,
      totalCommissionRate: 0.04,
      giftCommissionRate:  0.05,
      incomeRewardRate:    0.02,
      giftBonusRate:       0.03,
    },
    update: {
      totalCommissionRate: 0.04,
      giftCommissionRate:  0.05,
      incomeRewardRate:    0.02,
      giftBonusRate:       0.03,
    },
  });

  // ── 3. Wallet — tester ──────────────────────────────────────────────────────
  console.log('→ Setting up tester wallet (9,999,999 coins + beans)...');
  const meWallet = await prisma.wallet.upsert({
    where: { userId: ME },
    update: { coinBalance: 9_999_999, beanBalance: 9_999_999 },
    create: { userId: ME, coinBalance: 9_999_999, beanBalance: 9_999_999 },
  });

  // Free top-up record so it shows in payment history
  await prisma.walletTransaction.createMany({
    skipDuplicates: true,
    data: [
      {
        walletId:        meWallet.id,
        transactionType: 'credit',
        currency:        'coins',
        amount:          9_999_999,
        balanceAfter:    9_999_999,
        reference:       `free_topup_${ME}`,
        description:     'Dev seed — test account top-up',
      },
      {
        walletId:        meWallet.id,
        transactionType: 'credit',
        currency:        'beans',
        amount:          9_999_999,
        balanceAfter:    9_999_999,
        reference:       'gift_received',
        description:     'Dev seed — test beans loaded',
      },
    ],
  });

  // Supporter wallets (smaller, just to make the DB consistent)
  for (const s of supporters) {
    await prisma.wallet.upsert({
      where:  { userId: s.id },
      update: {},
      create: { userId: s.id, coinBalance: 5_000, beanBalance: s.role === 'host' ? 120_000 : 0 },
    });
  }

  // ── 4. User levels ──────────────────────────────────────────────────────────
  console.log('→ User levels...');
  const levels = [
    { userId: ME,              richLevel: 21, richXp: 999_999, charmLevel: 21, charmXp: 999_999 },
    { userId: SUPPORTERS.yuki,  richLevel: 5,  richXp: 22_000,  charmLevel: 9,  charmXp: 78_000  },
    { userId: SUPPORTERS.aisha, richLevel: 3,  richXp: 8_500,   charmLevel: 2,  charmXp: 3_200   },
    { userId: SUPPORTERS.kai,   richLevel: 7,  richXp: 40_000,  charmLevel: 1,  charmXp: 0       },
    { userId: SUPPORTERS.sara,  richLevel: 4,  richXp: 14_000,  charmLevel: 1,  charmXp: 0       },
    { userId: SUPPORTERS.leo,   richLevel: 6,  richXp: 30_000,  charmLevel: 1,  charmXp: 0       },
    { userId: SUPPORTERS.mia,   richLevel: 2,  richXp: 3_000,   charmLevel: 1,  charmXp: 0       },
  ];
  for (const l of levels) {
    await prisma.userLevel.upsert({
      where: { userId: l.userId },
      update: { richLevel: l.richLevel, richXp: l.richXp, charmLevel: l.charmLevel, charmXp: l.charmXp },
      create: l,
    });
  }

  // ── 5. Follows — supporters follow the tester ───────────────────────────────
  console.log('→ Follows...');
  const followPairs = [
    { actorId: SUPPORTERS.yuki,  targetId: ME },
    { actorId: SUPPORTERS.aisha, targetId: ME },
    { actorId: SUPPORTERS.kai,   targetId: ME },
    { actorId: SUPPORTERS.sara,  targetId: ME },
    { actorId: SUPPORTERS.leo,   targetId: ME },
    { actorId: SUPPORTERS.mia,   targetId: ME },
    // Tester follows back a couple
    { actorId: ME, targetId: SUPPORTERS.yuki },
    { actorId: ME, targetId: SUPPORTERS.kai  },
  ];
  for (const f of followPairs) {
    await prisma.follow.upsert({
      where: { actorId_targetId: { actorId: f.actorId, targetId: f.targetId } },
      update: {},
      create: f,
    });
  }

  // ── 6. Profile visits — supporters visited tester's profile ────────────────
  console.log('→ Profile visits...');
  for (const suppId of Object.values(SUPPORTERS)) {
    await prisma.profileVisit.upsert({
      where: { actorId_targetId: { actorId: suppId, targetId: ME } },
      update: { updatedAt: new Date() },
      create: { actorId: suppId, targetId: ME },
    });
  }
  // Tester also visited Yuki's and Kai's profiles
  await prisma.profileVisit.upsert({
    where: { actorId_targetId: { actorId: ME, targetId: SUPPORTERS.yuki } },
    update: {},
    create: { actorId: ME, targetId: SUPPORTERS.yuki },
  });
  await prisma.profileVisit.upsert({
    where: { actorId_targetId: { actorId: ME, targetId: SUPPORTERS.kai } },
    update: {},
    create: { actorId: ME, targetId: SUPPORTERS.kai },
  });

  // ── 7. Direct messages — supporters send DMs to tester ─────────────────────
  console.log('→ Direct messages...');
  const existingDMs = await prisma.directMessage.count({
    where: { recipientId: ME, senderId: { in: Object.values(SUPPORTERS) } },
  });
  if (existingDMs === 0) {
    const dmsToMe = [
      { senderId: SUPPORTERS.yuki,  content: 'Hey JjayFabor! Love your streams 🔥' },
      { senderId: SUPPORTERS.aisha, content: 'Welcome to Haka Live! 👋' },
      { senderId: SUPPORTERS.kai,   content: 'Can we collab sometime? 🎤' },
      { senderId: SUPPORTERS.sara,  content: 'You have great energy on stream!' },
      { senderId: SUPPORTERS.leo,   content: 'Just followed you. Keep it up! 💪' },
      { senderId: SUPPORTERS.mia,   content: 'Hi! Loved your last room 🌟' },
    ];
    for (const dm of dmsToMe) {
      await prisma.directMessage.create({ data: { ...dm, recipientId: ME } });
    }
    // Tester replies to Yuki and Kai
    await prisma.directMessage.create({ data: { senderId: ME, recipientId: SUPPORTERS.yuki, content: 'Thanks Yuki! Means a lot 🙏' } });
    await prisma.directMessage.create({ data: { senderId: ME, recipientId: SUPPORTERS.kai,  content: "Sure! Let's set it up 🎶" } });
    // Longer convo with Yuki
    await prisma.directMessage.create({ data: { senderId: SUPPORTERS.yuki, recipientId: ME, content: 'When are you going live next? 👀' } });
    await prisma.directMessage.create({ data: { senderId: ME, recipientId: SUPPORTERS.yuki, content: 'Tonight around 10PM! Tell everyone 😄' } });
    await prisma.directMessage.create({ data: { senderId: SUPPORTERS.yuki, recipientId: ME, content: "I'll be there! 🎉" } });
  }

  // ── 8. Gift transactions — supporters send gifts to tester ─────────────────
  console.log('→ Gift transactions...');
  const gifts = await prisma.gift.findMany({ select: { id: true, name: true, coinCost: true, beanValue: true } });

  const findGift = (name: string) => gifts.find(g => g.name === name);
  const crown    = findGift('Crown');
  const heart    = findGift('Heart');
  const rocket   = findGift('Rocket');
  const diamond  = findGift('Diamond');
  const fireworks = findGift('Fireworks');
  const loveRide  = findGift('Love Ride');

  const giftTxs = [
    crown    && { senderId: SUPPORTERS.yuki,  recipientId: ME, giftId: crown.id,     coinCost: crown.coinCost,     beanValue: crown.beanValue,     roomId: ROOM_ID },
    heart    && { senderId: SUPPORTERS.aisha, recipientId: ME, giftId: heart.id,     coinCost: heart.coinCost,     beanValue: heart.beanValue,     roomId: ROOM_ID },
    rocket   && { senderId: SUPPORTERS.kai,   recipientId: ME, giftId: rocket.id,    coinCost: rocket.coinCost,    beanValue: rocket.beanValue,    roomId: ROOM_ID },
    diamond  && { senderId: SUPPORTERS.sara,  recipientId: ME, giftId: diamond.id,   coinCost: diamond.coinCost,   beanValue: diamond.beanValue,   roomId: null    },
    heart    && { senderId: SUPPORTERS.leo,   recipientId: ME, giftId: heart.id,     coinCost: heart.coinCost,     beanValue: heart.beanValue,     roomId: ROOM_ID },
    fireworks && { senderId: SUPPORTERS.mia,  recipientId: ME, giftId: fireworks.id, coinCost: fireworks.coinCost, beanValue: fireworks.beanValue, roomId: ROOM_ID },
    loveRide  && { senderId: SUPPORTERS.yuki, recipientId: ME, giftId: loveRide.id,  coinCost: loveRide.coinCost,  beanValue: loveRide.beanValue,  roomId: ROOM_ID },
  ].filter(Boolean) as { senderId: string; recipientId: string; giftId: string; coinCost: number; beanValue: number; roomId: string | null }[];

  const existingGifts = await prisma.giftTransaction.count({ where: { recipientId: ME } });
  if (existingGifts === 0) {
    for (const tx of giftTxs) {
      await prisma.giftTransaction.create({ data: tx });
    }
  }

  if (giftTxs.length === 0) {
    console.log('  ⚠  Run the main seed first (npx prisma db seed) to create gifts catalogue');
  }

  // ── 9. Special attention — tester marks Yuki and Mia ──────────────────────
  console.log('→ Special attention...');
  for (const targetId of [SUPPORTERS.yuki, SUPPORTERS.mia]) {
    await prisma.specialAttention.upsert({
      where: { actorId_targetId: { actorId: ME, targetId } },
      update: {},
      create: { actorId: ME, targetId },
    });
  }

  // ── 10. Moments & Videos ─────────────────────────────────────────────────────
  console.log('→ Moments & videos...');

  const momentRows = [
    {
      id: MOMENTS.m1, userId: ME, postType: 'moment',
      caption: 'Just hit 9M coins! Thank you all for the support 🔥🙏',
      hashtag: '#hakalive #milestone #grateful',
      sharesCount: 8,
    },
    {
      id: MOMENTS.m2, userId: ME, postType: 'moment',
      caption: 'Good morning from Manila! Ready to go live tonight 🌅',
      hashtag: '#goodmorning #hakalive #philippines',
      sharesCount: 5,
    },
    {
      id: MOMENTS.m3, userId: ME, postType: 'moment',
      caption: "Thank you for all the gifts during last night's stream! You guys are amazing 💎",
      hashtag: '#thankyou #hakalive #community',
      sharesCount: 12,
    },
    {
      id: MOMENTS.v1, userId: ME, postType: 'video',
      mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      posterUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=430&h=932&fit=crop',
      caption: "Highlights from last week's stream 🎉",
      hashtag: '#highlights #hakalive',
      sharesCount: 20,
    },
    {
      id: MOMENTS.v2, userId: ME, postType: 'video',
      mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
      posterUrl: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=430&h=932&fit=crop',
      caption: 'Room party recap — we raised 50,000 beans together! 🎊',
      hashtag: '#party #hakalive #recap',
      sharesCount: 15,
    },
  ];

  for (const m of momentRows) {
    await prisma.moment.upsert({
      where: { id: m.id },
      update: {},
      create: m,
    });
  }

  // Moment likes
  const momentLikeRows = [
    // m1 — 6 likes
    { momentId: MOMENTS.m1, userId: SUPPORTERS.yuki  },
    { momentId: MOMENTS.m1, userId: SUPPORTERS.aisha },
    { momentId: MOMENTS.m1, userId: SUPPORTERS.kai   },
    { momentId: MOMENTS.m1, userId: SUPPORTERS.sara  },
    { momentId: MOMENTS.m1, userId: SUPPORTERS.leo   },
    { momentId: MOMENTS.m1, userId: SUPPORTERS.mia   },
    // m2 — 3 likes
    { momentId: MOMENTS.m2, userId: SUPPORTERS.yuki  },
    { momentId: MOMENTS.m2, userId: SUPPORTERS.kai   },
    { momentId: MOMENTS.m2, userId: SUPPORTERS.sara  },
    // m3 — 4 likes
    { momentId: MOMENTS.m3, userId: SUPPORTERS.yuki  },
    { momentId: MOMENTS.m3, userId: SUPPORTERS.aisha },
    { momentId: MOMENTS.m3, userId: SUPPORTERS.kai   },
    { momentId: MOMENTS.m3, userId: SUPPORTERS.leo   },
    // v1 — 6 likes
    { momentId: MOMENTS.v1, userId: SUPPORTERS.yuki  },
    { momentId: MOMENTS.v1, userId: SUPPORTERS.aisha },
    { momentId: MOMENTS.v1, userId: SUPPORTERS.kai   },
    { momentId: MOMENTS.v1, userId: SUPPORTERS.sara  },
    { momentId: MOMENTS.v1, userId: SUPPORTERS.leo   },
    { momentId: MOMENTS.v1, userId: SUPPORTERS.mia   },
    // v2 — 3 likes
    { momentId: MOMENTS.v2, userId: SUPPORTERS.yuki  },
    { momentId: MOMENTS.v2, userId: SUPPORTERS.kai   },
    { momentId: MOMENTS.v2, userId: SUPPORTERS.mia   },
  ];

  for (const like of momentLikeRows) {
    await prisma.momentLike.upsert({
      where: { momentId_userId: { momentId: like.momentId, userId: like.userId } },
      update: {},
      create: like,
    });
  }

  // Sync likesCount
  await prisma.moment.update({ where: { id: MOMENTS.m1 }, data: { likesCount: 6  } });
  await prisma.moment.update({ where: { id: MOMENTS.m2 }, data: { likesCount: 3  } });
  await prisma.moment.update({ where: { id: MOMENTS.m3 }, data: { likesCount: 4  } });
  await prisma.moment.update({ where: { id: MOMENTS.v1 }, data: { likesCount: 6  } });
  await prisma.moment.update({ where: { id: MOMENTS.v2 }, data: { likesCount: 3  } });

  // Moment comments (guard: only insert once)
  const existingComments = await prisma.momentComment.count({
    where: { momentId: { in: Object.values(MOMENTS) } },
  });
  if (existingComments === 0) {
    const commentRows = [
      { momentId: MOMENTS.m1, userId: SUPPORTERS.yuki,  text: 'Congrats!! You deserve it all 🔥' },
      { momentId: MOMENTS.m1, userId: SUPPORTERS.aisha, text: 'So proud of you! Keep going 💪' },
      { momentId: MOMENTS.m1, userId: SUPPORTERS.kai,   text: "9 million!! That's insane 😱" },
      { momentId: MOMENTS.m2, userId: SUPPORTERS.yuki,  text: "Morning! Can't wait for tonight 🌙" },
      { momentId: MOMENTS.m2, userId: SUPPORTERS.mia,   text: "I'll be tuning in! See you there 👋" },
      { momentId: MOMENTS.m3, userId: SUPPORTERS.sara,  text: 'You really made last night special ❤️' },
      { momentId: MOMENTS.m3, userId: SUPPORTERS.leo,   text: 'Best stream of the week no cap!' },
      { momentId: MOMENTS.v1, userId: SUPPORTERS.kai,   text: 'The clip at 2:30 had me dead 😂' },
      { momentId: MOMENTS.v1, userId: SUPPORTERS.aisha, text: 'These highlights never get old 🎉' },
      { momentId: MOMENTS.v2, userId: SUPPORTERS.yuki,  text: '50k beans together!! Best community 🏆' },
      { momentId: MOMENTS.v2, userId: SUPPORTERS.kai,   text: 'Next time we go for 100k 😤' },
    ];
    await prisma.momentComment.createMany({ data: commentRows });
  }

  // Sync commentsCount
  await prisma.moment.update({ where: { id: MOMENTS.m1 }, data: { commentsCount: 3 } });
  await prisma.moment.update({ where: { id: MOMENTS.m2 }, data: { commentsCount: 2 } });
  await prisma.moment.update({ where: { id: MOMENTS.m3 }, data: { commentsCount: 2 } });
  await prisma.moment.update({ where: { id: MOMENTS.v1 }, data: { commentsCount: 2 } });
  await prisma.moment.update({ where: { id: MOMENTS.v2 }, data: { commentsCount: 2 } });

  // ── 11. Live Party Room ───────────────────────────────────────────────────────
  console.log('→ Party room & chat messages...');

  await prisma.room.upsert({
    where: { id: ROOM_ID },
    update: {},
    create: {
      id:          ROOM_ID,
      hostId:      ME,
      title:       "JjayFabor's Party Room 🎉",
      description: "Welcome to my room! Let's vibe together. Drop your greetings below 👇",
      category:    'music',
      type:        'public',
      status:      'live',
      micConfig:   10,
      viewerCount: 127,
      agoraChannel: ROOM_ID,
      startedAt:   hoursAgo(1),
    },
  });

  // Seats (position 1 = host)
  const seatRows = [
    { position: 1,  userId: ME,              isMuted: false },
    { position: 2,  userId: SUPPORTERS.yuki, isMuted: false },
    { position: 3,  userId: SUPPORTERS.kai,  isMuted: false },
    { position: 4,  userId: null,             isMuted: false },
    { position: 5,  userId: SUPPORTERS.leo,  isMuted: true  },
    { position: 6,  userId: null,             isMuted: false },
    { position: 7,  userId: null,             isMuted: false },
    { position: 8,  userId: null,             isMuted: false },
    { position: 9,  userId: null,             isMuted: false },
    { position: 10, userId: null,             isMuted: false },
  ];
  for (const seat of seatRows) {
    await prisma.roomSeat.upsert({
      where: { roomId_position: { roomId: ROOM_ID, position: seat.position } },
      update: {},
      create: { roomId: ROOM_ID, ...seat },
    });
  }

  // Chat messages (guard: only insert once)
  const existingRoomMsgs = await prisma.roomMessage.count({ where: { roomId: ROOM_ID } });
  if (existingRoomMsgs === 0) {
    const roomMsgRows = [
      { senderId: SUPPORTERS.aisha, content: 'Great room tonight! 🔥' },
      { senderId: SUPPORTERS.mia,   content: 'Love the energy here 💜' },
      { senderId: SUPPORTERS.sara,  content: 'Sending roses 🌹🌹🌹' },
      { senderId: SUPPORTERS.yuki,  content: "JjayFabor you're the best host!" },
      { senderId: SUPPORTERS.leo,   content: 'First time here, this is amazing!' },
      { senderId: SUPPORTERS.kai,   content: 'More gifts incoming 😎' },
      { senderId: ME,               content: "Welcome everyone! So glad you're here 🙌" },
      { senderId: SUPPORTERS.aisha, content: 'Level 21 rich level?? LEGEND 👑' },
      { senderId: SUPPORTERS.mia,   content: 'This room is on FIRE 🎵' },
      { senderId: ME,               content: "Let's hit 200 viewers tonight!! 💪" },
      { senderId: SUPPORTERS.kai,   content: 'Already told 10 friends to join 😄' },
      { senderId: SUPPORTERS.yuki,  content: '🎁🎁🎁 incoming!' },
    ];
    await prisma.roomMessage.createMany({
      data: roomMsgRows.map(m => ({ ...m, roomId: ROOM_ID })),
    });
  }

  // ── 12. Family (Party Group) ─────────────────────────────────────────────────
  console.log('→ Family...');

  await prisma.family.upsert({
    where: { id: FAMILY_ID },
    update: {},
    create: {
      id:           FAMILY_ID,
      name:         'Haka Warriors',
      ownerId:      ME,
      tier:         'gold',
      badge:        '⚔️',
      announcement: 'Welcome to Haka Warriors! The strongest family on Haka Live 💪 We grind together.',
      weeklyBeans:  280_000,
      totalBeans:   1_450_000,
    },
  });

  const familyMemberRows = [
    { familyId: FAMILY_ID, userId: ME,              role: 'owner'  },
    { familyId: FAMILY_ID, userId: SUPPORTERS.yuki, role: 'admin'  },
    { familyId: FAMILY_ID, userId: SUPPORTERS.aisha, role: 'member' },
    { familyId: FAMILY_ID, userId: SUPPORTERS.kai,  role: 'member' },
  ];
  for (const m of familyMemberRows) {
    await prisma.familyMember.upsert({
      where: { userId: m.userId },
      update: {},
      create: m,
    });
  }

  // ── 13. Notifications ─────────────────────────────────────────────────────────
  console.log('→ Notifications...');

  const existingNotifs = await prisma.notification.count({ where: { userId: ME } });
  if (existingNotifs === 0) {
    const notifRows = [
      { userId: ME, type: 'new_follower',  title: 'New Follower',         body: 'Yuki Tanaka started following you',              imageUrl: 'https://i.pravatar.cc/150?u=ts_yuki',  isRead: false, data: { actorId: SUPPORTERS.yuki  } },
      { userId: ME, type: 'new_follower',  title: 'New Follower',         body: 'Aisha Malik started following you',              imageUrl: 'https://i.pravatar.cc/150?u=ts_aisha', isRead: false, data: { actorId: SUPPORTERS.aisha } },
      { userId: ME, type: 'new_follower',  title: 'New Follower',         body: 'Kai Rivera started following you',               imageUrl: 'https://i.pravatar.cc/150?u=ts_kai',   isRead: true,  data: { actorId: SUPPORTERS.kai   } },
      { userId: ME, type: 'new_follower',  title: 'New Follower',         body: 'Sara Lin started following you',                 imageUrl: 'https://i.pravatar.cc/150?u=ts_sara',  isRead: true,  data: { actorId: SUPPORTERS.sara  } },
      { userId: ME, type: 'new_follower',  title: 'New Follower',         body: 'Leo Stone started following you',                imageUrl: 'https://i.pravatar.cc/150?u=ts_leo',   isRead: true,  data: { actorId: SUPPORTERS.leo   } },
      { userId: ME, type: 'new_follower',  title: 'New Follower',         body: 'Mia Chen started following you',                 imageUrl: 'https://i.pravatar.cc/150?u=ts_mia',   isRead: true,  data: { actorId: SUPPORTERS.mia   } },
      { userId: ME, type: 'gift_received', title: 'Gift Received',        body: 'Yuki Tanaka sent you a Crown 👑',               imageUrl: 'https://i.pravatar.cc/150?u=ts_yuki',  isRead: false, data: { giftName: 'Crown'    } },
      { userId: ME, type: 'gift_received', title: 'Gift Received',        body: 'Kai Rivera sent you a Rocket 🚀',               imageUrl: 'https://i.pravatar.cc/150?u=ts_kai',   isRead: false, data: { giftName: 'Rocket'   } },
      { userId: ME, type: 'gift_received', title: 'Gift Received',        body: 'Sara Lin sent you a Diamond 💎',                imageUrl: 'https://i.pravatar.cc/150?u=ts_sara',  isRead: true,  data: { giftName: 'Diamond'  } },
      { userId: ME, type: 'gift_received', title: 'Gift Received',        body: 'Yuki Tanaka sent you a Love Ride 💕',           imageUrl: 'https://i.pravatar.cc/150?u=ts_yuki',  isRead: false, data: { giftName: 'Love Ride' } },
      { userId: ME, type: 'system',        title: 'Welcome to Haka Live', body: 'Complete your profile to start streaming!',     imageUrl: '',                                      isRead: true,  data: Prisma.DbNull },
      { userId: ME, type: 'system',        title: 'Top 10 Host',          body: 'You ranked #5 on the weekly leaderboard! 🏆',  imageUrl: '',                                      isRead: false, data: Prisma.DbNull },
      { userId: ME, type: 'system',        title: 'New Party Invite',     body: 'Leo Stone invited you to join a party room 🎉', imageUrl: 'https://i.pravatar.cc/150?u=ts_leo',  isRead: false, data: { roomId: ROOM_ID } },
    ];
    await prisma.notification.createMany({ data: notifRows });
  }

  // ── 13. Extra live hosts (gift-send testing) ─────────────────────────────────
  console.log('→ Extra live hosts...');

  const liveHostDefs = [
    { key: 'nova',  id: LIVE_HOSTS.nova.id,  roomId: LIVE_HOSTS.nova.roomId,  supabaseUid: 'dev-host-nova',  username: 'nova_live',   displayName: 'Nova ✨',      hakaId: HAKA_IDS.nova,  avatar: 'https://i.pravatar.cc/150?u=nova_live',   title: "Nova's Chill Room 🌙",   category: 'music',  viewers: 43  },
    { key: 'zara',  id: LIVE_HOSTS.zara.id,  roomId: LIVE_HOSTS.zara.roomId,  supabaseUid: 'dev-host-zara',  username: 'zara_beats',  displayName: 'Zara Beats 🎵', hakaId: HAKA_IDS.zara,  avatar: 'https://i.pravatar.cc/150?u=zara_beats',  title: 'Beats & Vibes 🎶',       category: 'music',  viewers: 89  },
    { key: 'marco', id: LIVE_HOSTS.marco.id, roomId: LIVE_HOSTS.marco.roomId, supabaseUid: 'dev-host-marco', username: 'marco_talks', displayName: 'Marco 🎤',      hakaId: HAKA_IDS.marco, avatar: 'https://i.pravatar.cc/150?u=marco_talks', title: 'Late Night Talk 🌃',      category: 'talk',   viewers: 61  },
  ];

  for (const h of liveHostDefs) {
    await prisma.user.upsert({
      where: { id: h.id },
      update: { password: devPasswordHash },
      create: {
        id: h.id, supabaseUid: h.supabaseUid, password: devPasswordHash, username: h.username,
        displayName: h.displayName, hakaId: h.hakaId,
        role: 'host', hostType: 'independent', hostApplicationPath: 'self_apply_independent',
        onboardingComplete: true, avatar: h.avatar, country: 'PH',
      },
    });
    await prisma.wallet.upsert({
      where: { userId: h.id },
      update: {},
      create: { userId: h.id, coinBalance: 5_000, beanBalance: 20_000 },
    });
    await prisma.room.upsert({
      where: { id: h.roomId },
      update: {},
      create: {
        id: h.roomId, hostId: h.id, title: h.title,
        description: 'Join and say hi!', category: h.category as 'music' | 'talk',
        type: 'public', status: 'live', micConfig: 5,
        viewerCount: h.viewers, agoraChannel: h.roomId, startedAt: hoursAgo(0.5),
      },
    });
    // Seat 1 = host
    await prisma.roomSeat.upsert({
      where: { roomId_position: { roomId: h.roomId, position: 1 } },
      update: {},
      create: { roomId: h.roomId, position: 1, userId: h.id, isMuted: false },
    });
    // A few chat messages
    const msgCount = await prisma.roomMessage.count({ where: { roomId: h.roomId } });
    if (msgCount === 0) {
      await prisma.roomMessage.createMany({
        data: [
          { roomId: h.roomId, senderId: ME,             content: 'Hey! Great room 🔥' },
          { roomId: h.roomId, senderId: SUPPORTERS.yuki, content: 'Love this vibes 💜' },
          { roomId: h.roomId, senderId: h.id,            content: 'Welcome everyone! 🙌' },
        ],
      });
    }
  }

  // ── 14. Role-specific test accounts ─────────────────────────────────────────
  // Each account can be logged into via the "Login with Haka ID" screen.
  // Password for all: haka2024 (or env DEV_LOGIN_PASSWORD)
  console.log('→ Role-specific test accounts (agent, agent_host, normal_user)...');

  // -- Agent user (runs an agency, sees Agency Center + Coin Seller)
  await prisma.user.upsert({
    where: { id: ROLE_ACCOUNTS.agent.id },
    update: {
      role: 'agent',
      displayName: 'Agent Boss',
      password: devPasswordHash,
    },
    create: {
      id:                  ROLE_ACCOUNTS.agent.id,
      supabaseUid:         'dev-role-agent',
      password:            devPasswordHash,
      username:            'agent_boss',
      displayName:         'Agent Boss',
      hakaId:              HAKA_IDS.agent,
      role:                'agent',
      hostType:            '',
      hostApplicationPath: '',
      onboardingComplete:  true,
      avatar:              'https://i.pravatar.cc/150?u=agent_boss',
      country:             'GB',
      bio:                 'Official test agent account',
    },
  });

  // Agent's wallet
  await prisma.wallet.upsert({
    where:  { userId: ROLE_ACCOUNTS.agent.id },
    update: { coinBalance: 500_000, beanBalance: 200_000 },
    create: { userId: ROLE_ACCOUNTS.agent.id, coinBalance: 500_000, beanBalance: 200_000 },
  });

  // Agent's agency record
  await prisma.agency.upsert({
    where:  { ownerId: ROLE_ACCOUNTS.agent.id },
    update: {},
    create: {
      id:               ROLE_ACCOUNTS.agent.agencyId,
      name:             'Boss Agency',
      ownerId:          ROLE_ACCOUNTS.agent.id,
      status:           'active',
      hostRevenueShare: 0.70,
      agentRevenueShare: 0.20,
      companyShare:     0.10,
      description:      'Top agency for rising stars',
    },
  });

  // Agent level
  await prisma.userLevel.upsert({
    where:  { userId: ROLE_ACCOUNTS.agent.id },
    update: {},
    create: { userId: ROLE_ACCOUNTS.agent.id, richLevel: 10, richXp: 80_000, charmLevel: 5, charmXp: 22_000 },
  });

  // -- Agent Host (linked to Agent Boss, sees Host Center + Host Data)
  await prisma.user.upsert({
    where: { id: ROLE_ACCOUNTS.agentHost.id },
    update: {
      role:     'host',
      hostType: 'agent_host',
      agentId:  ROLE_ACCOUNTS.agent.id,
      password: devPasswordHash,
    },
    create: {
      id:                  ROLE_ACCOUNTS.agentHost.id,
      supabaseUid:         'dev-role-agenthost',
      password:            devPasswordHash,
      username:            'luna_star',
      displayName:         'Luna Star',
      hakaId:              HAKA_IDS.agentHost,
      role:                'host',
      hostType:            'agent_host',
      hostApplicationPath: 'agency_invitation',
      agentId:             ROLE_ACCOUNTS.agent.id,
      onboardingComplete:  true,
      avatar:              'https://i.pravatar.cc/150?u=luna_star',
      country:             'US',
      bio:                 'Agent host under Boss Agency',
    },
  });

  await prisma.wallet.upsert({
    where:  { userId: ROLE_ACCOUNTS.agentHost.id },
    update: { coinBalance: 50_000, beanBalance: 80_000 },
    create: { userId: ROLE_ACCOUNTS.agentHost.id, coinBalance: 50_000, beanBalance: 80_000 },
  });

  await prisma.userLevel.upsert({
    where:  { userId: ROLE_ACCOUNTS.agentHost.id },
    update: {},
    create: { userId: ROLE_ACCOUNTS.agentHost.id, richLevel: 6, richXp: 30_000, charmLevel: 8, charmXp: 60_000 },
  });

  // -- Normal User (fresh user, sees Apply for Agency / Apply for Host)
  await prisma.user.upsert({
    where: { id: ROLE_ACCOUNTS.normalUser.id },
    update: {
      role:     'normal_user',
      hostType: '',
      password: devPasswordHash,
    },
    create: {
      id:                  ROLE_ACCOUNTS.normalUser.id,
      supabaseUid:         'dev-role-normal',
      password:            devPasswordHash,
      username:            'newbie_fan',
      displayName:         'Newbie Fan',
      hakaId:              HAKA_IDS.normalUser,
      role:                'normal_user',
      hostType:            '',
      hostApplicationPath: '',
      onboardingComplete:  true,
      avatar:              'https://i.pravatar.cc/150?u=newbie_fan',
      country:             'US',
      bio:                 'Just joined Haka Live!',
    },
  });

  await prisma.wallet.upsert({
    where:  { userId: ROLE_ACCOUNTS.normalUser.id },
    update: { coinBalance: 10_000, beanBalance: 0 },
    create: { userId: ROLE_ACCOUNTS.normalUser.id, coinBalance: 10_000, beanBalance: 0 },
  });

  await prisma.userLevel.upsert({
    where:  { userId: ROLE_ACCOUNTS.normalUser.id },
    update: {},
    create: { userId: ROLE_ACCOUNTS.normalUser.id, richLevel: 1, richXp: 500, charmLevel: 1, charmXp: 0 },
  });

  // Also link Yuki (supporter) properly as an agent_host under Agent Boss
  await prisma.user.update({
    where: { id: SUPPORTERS.yuki },
    data: {
      role:     'host',
      hostType: 'agent_host',
      hostApplicationPath: 'self_apply_with_agent',
      agentId:  ROLE_ACCOUNTS.agent.id,
    },
  });

  // ── 15. Verified female host (FemaleHostTaskScreen) ─────────────────────────
  console.log('→ Verified female host (level tasks UI)...');
  const femaleHostCreatedAt = daysAgo(30);
  await prisma.user.upsert({
    where: { id: FEMALE_HOST },
    update: {
      supabaseUid: 'dev-female-host',
      password: devPasswordHash,
      role: 'host',
      hostType: 'independent',
      hostApplicationPath: 'self_apply_independent',
      gender: 'female',
      isVerifiedHost: true,
      onboardingComplete: true,
      displayName: 'Maya Host',
      username: 'maya_host',
      hakaId: HAKA_IDS.femaleHost,
      avatar: 'https://i.pravatar.cc/150?u=maya_host',
      country: 'PH',
      bio: 'Verified female host · test FemaleHostTask screen',
      createdAt: femaleHostCreatedAt,
    },
    create: {
      id: FEMALE_HOST,
      supabaseUid: 'dev-female-host',
      password: devPasswordHash,
      role: 'host',
      hostType: 'independent',
      hostApplicationPath: 'self_apply_independent',
      gender: 'female',
      isVerifiedHost: true,
      onboardingComplete: true,
      displayName: 'Maya Host',
      username: 'maya_host',
      hakaId: HAKA_IDS.femaleHost,
      avatar: 'https://i.pravatar.cc/150?u=maya_host',
      country: 'PH',
      bio: 'Verified female host · test FemaleHostTask screen',
      createdAt: femaleHostCreatedAt,
    },
  });

  await prisma.wallet.upsert({
    where: { userId: FEMALE_HOST },
    update: { coinBalance: 50_000, beanBalance: 120_000 },
    create: { userId: FEMALE_HOST, coinBalance: 50_000, beanBalance: 120_000 },
  });

  await prisma.userLevel.upsert({
    where: { userId: FEMALE_HOST },
    update: {},
    create: {
      userId: FEMALE_HOST,
      richLevel: 8,
      richXp: 55_000,
      charmLevel: 12,
      charmXp: 140_000,
    },
  });

  // Sample mic time today (shows progress on milestone cards)
  const femaleRoomId = '620001';
  await prisma.room.upsert({
    where: { id: femaleRoomId },
    update: {},
    create: {
      id: femaleRoomId,
      hostId: FEMALE_HOST,
      title: "Maya's Live Room",
      description: 'Female host task test room',
      category: 'music',
      type: 'public',
      status: 'live',
      roomMode: 'chat',
      micConfig: 5,
      viewerCount: 12,
      agoraChannel: femaleRoomId,
      startedAt: hoursAgo(1),
    },
  });
  const micStarted = new Date(Date.now() - 45 * 60 * 1000);
  await prisma.hostMicSession.deleteMany({ where: { userId: FEMALE_HOST } });
  await prisma.hostMicSession.create({
    data: {
      userId: FEMALE_HOST,
      roomId: femaleRoomId,
      roomMode: 'chat',
      seatIndex: 0,
      startedAt: micStarted,
      endedAt: new Date(),
      minutes: 45,
      beansAwarded: 0,
    },
  });

  // ── Done ───────────────────────────────────────────────────────────────────
  const unreadNotifs = await prisma.notification.count({ where: { userId: ME, isRead: false } });
  console.log('\n✅ Test user seed complete!\n');
  console.log('════════════════════════════════════════════');
  console.log(`  LOGIN CREDENTIALS (all use password: ${devPassword})`);
  console.log('  Screen: Login with Haka ID');
  console.log('────────────────────────────────────────────');
  console.log(`  ${HAKA_IDS.me}         — JjayFabor      role: host (independent) · coin seller`);
  console.log(`  ${HAKA_IDS.agent}      — Agent Boss     role: agent`);
  console.log(`  ${HAKA_IDS.agentHost}  — Luna Star      role: host (agent_host, under Agent Boss)`);
  console.log(`  ${HAKA_IDS.normalUser} — Newbie Fan     role: normal_user`);
  console.log(`  ${HAKA_IDS.yuki}       — Yuki Tanaka    role: host (agent_host, under Agent Boss)`);
  console.log(`  ${HAKA_IDS.nova}       — Nova           role: host (independent)`);
  console.log(`  ${HAKA_IDS.zara}       — Zara Beats     role: host (independent)`);
  console.log(`  ${HAKA_IDS.marco}      — Marco          role: host (independent)`);
  console.log(`  ${HAKA_IDS.femaleHost} — Maya Host      role: host (female, verified) → FemaleHostTask`);
  console.log('════════════════════════════════════════════');
  console.log('  JjayFabor wallet: 9,999,999 coins · 9,999,999 beans');
  console.log('  Level    : Rich 21 · Charm 21 (max)');
  console.log('  Followers: 6  |  Following: 2');
  console.log('  Party room: "JjayFabor\'s Party Room" — live, 10 seats');
  console.log('  Family   : "Haka Warriors" — Gold tier, 4 members');
  console.log(`  Notifications: ${unreadNotifs} unread`);
  console.log('════════════════════════════════════════════\n');
}

main()
  .catch((e) => { console.error('❌ Test user seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
