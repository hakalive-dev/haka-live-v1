/**
 * Demo seed — populates the database with realistic test data.
 * Run: npx ts-node prisma/seed-demo.ts
 * (Or: docker compose -f docker-compose.dev.yml exec backend npx ts-node prisma/seed-demo.ts)
 *
 * Safe to re-run: uses upsert/skipDuplicates throughout.
 * Also seeds Redis regional earner ZSETs (daily/weekly/monthly) for home-feed badges when REDIS_URL is set.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** 9-digit public Haka ID (500000001 … 999999999). */
const publicHakaId = (n: number) => String(500_000_000 + n);

// ── Fixed IDs so relations are predictable ────────────────────────────────────
const IDS = {
  // Agents
  agent1:  'a0000001-0000-4000-8000-000000000001',
  agent2:  'a0000002-0000-4000-8000-000000000002',
  // Hosts (agent_host)
  host1:   'b0000001-0000-4000-8000-000000000001',
  host2:   'b0000002-0000-4000-8000-000000000002',
  host3:   'b0000003-0000-4000-8000-000000000003',
  host4:   'b0000004-0000-4000-8000-000000000004',
  // Hosts (independent)
  ihost1:  'c0000001-0000-4000-8000-000000000001',
  ihost2:  'c0000002-0000-4000-8000-000000000002',
  // Normal users
  user1:   'd0000001-0000-4000-8000-000000000001',
  user2:   'd0000002-0000-4000-8000-000000000002',
  user3:   'd0000003-0000-4000-8000-000000000003',
  user4:   'd0000004-0000-4000-8000-000000000004',
  user5:   'd0000005-0000-4000-8000-000000000005',
  // Rooms
  room1:   'e0000001-0000-4000-8000-000000000001',
  room2:   'e0000002-0000-4000-8000-000000000002',
  room3:   'e0000003-0000-4000-8000-000000000003',
  room4:   'e0000004-0000-4000-8000-000000000004',
  room5:   'e0000005-0000-4000-8000-000000000005',
  // CoinPackages
  pkg1:    'f0000001-0000-4000-8000-000000000001',
  pkg2:    'f0000002-0000-4000-8000-000000000002',
  pkg3:    'f0000003-0000-4000-8000-000000000003',
  pkg4:    'f0000004-0000-4000-8000-000000000004',
  pkg5:    'f0000005-0000-4000-8000-000000000005',
  pkg6:    'f0000006-0000-4000-8000-000000000006',
  // Families
  fam1:    'g0000001-0000-4000-8000-000000000001',
  fam2:    'g0000002-0000-4000-8000-000000000002',
};

async function main() {
  console.log('🌱 Seeding demo data...\n');

  // ── 1. Coin Packages ─────────────────────────────────────────────────────────
  console.log('→ Coin packages...');
  await prisma.coinPackage.createMany({
    skipDuplicates: true,
    data: [
      { id: IDS.pkg1, coins: 100,    bonusCoins: 0,     priceGbp: 0.99,  isActive: true, order: 1 },
      { id: IDS.pkg2, coins: 500,    bonusCoins: 50,    priceGbp: 4.99,  isActive: true, order: 2 },
      { id: IDS.pkg3, coins: 1000,   bonusCoins: 150,   priceGbp: 8.99,  isActive: true, order: 3 },
      { id: IDS.pkg4, coins: 2500,   bonusCoins: 500,   priceGbp: 19.99, isActive: true, order: 4 },
      { id: IDS.pkg5, coins: 5000,   bonusCoins: 1250,  priceGbp: 39.99, isActive: true, order: 5 },
      { id: IDS.pkg6, coins: 10000,  bonusCoins: 3000,  priceGbp: 69.99, isActive: true, order: 6 },
    ],
  });

  // ── 2. Users ─────────────────────────────────────────────────────────────────
  console.log('→ Users...');

  const users = [
    // Agents
    { id: IDS.agent1, supabaseUid: 'firebase_agent_001', username: 'priya_sharma', displayName: 'Priya Sharma',  hakaId: publicHakaId(20), role: 'agent', hostType: '', agentId: null, onboardingComplete: true, avatar: 'https://i.pravatar.cc/150?u=priya', country: 'GB', city: '' },
    { id: IDS.agent2, supabaseUid: 'firebase_agent_002', username: 'omar_hassan',  displayName: 'Omar Hassan',   hakaId: publicHakaId(21), role: 'agent', hostType: '', agentId: null, onboardingComplete: true, avatar: 'https://i.pravatar.cc/150?u=omar',  country: 'GB', city: '' },
    // Agent hosts (under agent1)
    { id: IDS.host1,  supabaseUid: 'firebase_host_001',  username: 'yuki_tanaka',  displayName: 'Yuki Tanaka',   hakaId: publicHakaId(22), role: 'host', hostType: 'agent_host', agentId: IDS.agent1, hostApplicationPath: 'self_apply_with_agent', onboardingComplete: true, avatar: 'https://i.pravatar.cc/150?u=yuki',  country: 'IN', city: 'Delhi' },
    { id: IDS.host2,  supabaseUid: 'firebase_host_002',  username: 'aisha_malik',  displayName: 'Aisha Malik',   hakaId: publicHakaId(23), role: 'host', hostType: 'agent_host', agentId: IDS.agent1, hostApplicationPath: 'agency_invitation',    onboardingComplete: true, avatar: 'https://i.pravatar.cc/150?u=aisha', country: 'GB', city: '' },
    // Agent hosts (under agent2)
    { id: IDS.host3,  supabaseUid: 'firebase_host_003',  username: 'kai_rivera',   displayName: 'Kai Rivera',    hakaId: publicHakaId(24), role: 'host', hostType: 'agent_host', agentId: IDS.agent2, hostApplicationPath: 'self_apply_with_agent', onboardingComplete: true, avatar: 'https://i.pravatar.cc/150?u=kai',   country: 'US', city: 'Austin' },
    { id: IDS.host4,  supabaseUid: 'firebase_host_004',  username: 'sara_lin',     displayName: 'Sara Lin',      hakaId: publicHakaId(25), role: 'host', hostType: 'agent_host', agentId: IDS.agent2, hostApplicationPath: 'agency_invitation',    onboardingComplete: true, avatar: 'https://i.pravatar.cc/150?u=sara',  country: 'GB', city: '' },
    // Independent hosts
    { id: IDS.ihost1, supabaseUid: 'firebase_ihost_001', username: 'leo_stone',    displayName: 'Leo Stone',     hakaId: publicHakaId(26), role: 'host', hostType: 'independent', agentId: null, hostApplicationPath: 'self_apply_independent', onboardingComplete: true, avatar: 'https://i.pravatar.cc/150?u=leo',   country: 'GB', city: '' },
    { id: IDS.ihost2, supabaseUid: 'firebase_ihost_002', username: 'mia_chen',     displayName: 'Mia Chen',      hakaId: publicHakaId(27), role: 'host', hostType: 'independent', agentId: null, hostApplicationPath: 'self_apply_independent', onboardingComplete: true, avatar: 'https://i.pravatar.cc/150?u=mia',   country: 'GB', city: '' },
    // Normal users
    { id: IDS.user1,  supabaseUid: 'firebase_user_001',  username: 'raj_kumar',    displayName: 'Raj Kumar',     hakaId: publicHakaId(28), role: 'normal_user', hostType: '', agentId: null, onboardingComplete: true, avatar: 'https://i.pravatar.cc/150?u=raj',   country: 'IN', city: 'Delhi' },
    { id: IDS.user2,  supabaseUid: 'firebase_user_002',  username: 'emma_white',   displayName: 'Emma White',    hakaId: publicHakaId(29), role: 'normal_user', hostType: '', agentId: null, onboardingComplete: true, avatar: 'https://i.pravatar.cc/150?u=emma',  country: 'IN', city: 'Delhi' },
    { id: IDS.user3,  supabaseUid: 'firebase_user_003',  username: 'arjun_patel',  displayName: 'Arjun Patel',   hakaId: publicHakaId(30), role: 'normal_user', hostType: '', agentId: null, onboardingComplete: true, avatar: 'https://i.pravatar.cc/150?u=arjun', country: 'IN', city: 'Delhi' },
    { id: IDS.user4,  supabaseUid: 'firebase_user_004',  username: 'sophie_brown', displayName: 'Sophie Brown',  hakaId: publicHakaId(31), role: 'normal_user', hostType: '', agentId: null, onboardingComplete: true, avatar: 'https://i.pravatar.cc/150?u=sophie', country: 'US', city: 'Austin' },
    { id: IDS.user5,  supabaseUid: 'firebase_user_005',  username: 'james_kim',    displayName: 'James Kim',     hakaId: publicHakaId(32), role: 'normal_user', hostType: '', agentId: null, onboardingComplete: true, avatar: 'https://i.pravatar.cc/150?u=james', country: 'GB', city: '' },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: {
        hakaId: u.hakaId,
        country: u.country,
        city: u.city ?? '',
      },
      create: {
        id: u.id,
        supabaseUid: u.supabaseUid,
        username: u.username,
        displayName: u.displayName,
        hakaId: u.hakaId,
        role: u.role,
        hostType: u.hostType,
        hostApplicationPath: u.hostApplicationPath ?? '',
        agentId: u.agentId,
        onboardingComplete: u.onboardingComplete,
        avatar: u.avatar,
        country: u.country,
        city: u.city ?? '',
        bio: `Hi, I'm ${u.displayName}! Welcome to my profile.`,
      },
    });
  }

  // ── 3. User Levels ───────────────────────────────────────────────────────────
  console.log('→ User levels...');
  const levelData = [
    { userId: IDS.agent1,  richLevel: 8,  richXp: 45000,  charmLevel: 3,  charmXp: 8000  },
    { userId: IDS.agent2,  richLevel: 6,  richXp: 28000,  charmLevel: 2,  charmXp: 4000  },
    { userId: IDS.host1,   richLevel: 5,  richXp: 20000,  charmLevel: 9,  charmXp: 78000 },
    { userId: IDS.host2,   richLevel: 4,  richXp: 14000,  charmLevel: 7,  charmXp: 52000 },
    { userId: IDS.host3,   richLevel: 3,  richXp: 9000,   charmLevel: 11, charmXp: 98000 },
    { userId: IDS.host4,   richLevel: 2,  richXp: 3000,   charmLevel: 6,  charmXp: 35000 },
    { userId: IDS.ihost1,  richLevel: 4,  richXp: 16000,  charmLevel: 8,  charmXp: 60000 },
    { userId: IDS.ihost2,  richLevel: 3,  richXp: 7000,   charmLevel: 5,  charmXp: 22000 },
    { userId: IDS.user1,   richLevel: 10, richXp: 92000,  charmLevel: 1,  charmXp: 200   },
    { userId: IDS.user2,   richLevel: 7,  richXp: 38000,  charmLevel: 1,  charmXp: 0     },
    { userId: IDS.user3,   richLevel: 5,  richXp: 21000,  charmLevel: 1,  charmXp: 100   },
    { userId: IDS.user4,   richLevel: 3,  richXp: 8000,   charmLevel: 1,  charmXp: 0     },
    { userId: IDS.user5,   richLevel: 2,  richXp: 2500,   charmLevel: 1,  charmXp: 0     },
  ];
  for (const l of levelData) {
    await prisma.userLevel.upsert({
      where: { userId: l.userId },
      update: {},
      create: l,
    });
  }

  // ── 4. Wallets ───────────────────────────────────────────────────────────────
  console.log('→ Wallets...');
  const walletData = [
    { userId: IDS.agent1,  coinBalance: 12500,  beanBalance: 185000 },
    { userId: IDS.agent2,  coinBalance: 8200,   beanBalance: 94000  },
    { userId: IDS.host1,   coinBalance: 3400,   beanBalance: 72000  },
    { userId: IDS.host2,   coinBalance: 1800,   beanBalance: 48000  },
    { userId: IDS.host3,   coinBalance: 5100,   beanBalance: 121000 },
    { userId: IDS.host4,   coinBalance: 900,    beanBalance: 32000  },
    { userId: IDS.ihost1,  coinBalance: 4200,   beanBalance: 88000  },
    { userId: IDS.ihost2,  coinBalance: 2100,   beanBalance: 41000  },
    { userId: IDS.user1,   coinBalance: 28400,  beanBalance: 0      },
    { userId: IDS.user2,   coinBalance: 15700,  beanBalance: 0      },
    { userId: IDS.user3,   coinBalance: 6300,   beanBalance: 0      },
    { userId: IDS.user4,   coinBalance: 3200,   beanBalance: 0      },
    { userId: IDS.user5,   coinBalance: 1100,   beanBalance: 0      },
  ];

  const walletIds: Record<string, string> = {};
  for (const w of walletData) {
    const wallet = await prisma.wallet.upsert({
      where: { userId: w.userId },
      update: {},
      create: w,
    });
    walletIds[w.userId] = wallet.id;
  }

  // ── 5. Wallet Transactions ───────────────────────────────────────────────────
  console.log('→ Wallet transactions...');
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);

  const walletTxs = [
    // user1 top-ups and gifts
    { walletId: walletIds[IDS.user1], transactionType: 'credit', currency: 'coins', amount: 13000, balanceAfter: 13000, reference: 'top_up',    description: 'Ultimate Pack — 10,000 + 3,000 bonus coins', createdAt: daysAgo(14) },
    { walletId: walletIds[IDS.user1], transactionType: 'credit', currency: 'coins', amount: 3000,  balanceAfter: 16000, reference: 'top_up',    description: 'Super Pack — 2,500 + 500 bonus coins',       createdAt: daysAgo(7)  },
    { walletId: walletIds[IDS.user1], transactionType: 'debit',  currency: 'coins', amount: 1000,  balanceAfter: 15000, reference: 'gift_sent', description: 'Sent Crown 👑 to Yuki Tanaka',               createdAt: daysAgo(6)  },
    { walletId: walletIds[IDS.user1], transactionType: 'debit',  currency: 'coins', amount: 5000,  balanceAfter: 10000, reference: 'gift_sent', description: 'Sent Rocket 🚀 to Kai Rivera',              createdAt: daysAgo(4)  },
    { walletId: walletIds[IDS.user1], transactionType: 'credit', currency: 'coins', amount: 6250,  balanceAfter: 16250, reference: 'top_up',    description: 'Mega Pack — 5,000 + 1,250 bonus coins',      createdAt: daysAgo(2)  },
    // user2 activity
    { walletId: walletIds[IDS.user2], transactionType: 'credit', currency: 'coins', amount: 6250,  balanceAfter: 6250,  reference: 'top_up',    description: 'Mega Pack — 5,000 + 1,250 bonus coins',      createdAt: daysAgo(10) },
    { walletId: walletIds[IDS.user2], transactionType: 'debit',  currency: 'coins', amount: 299,   balanceAfter: 5951,  reference: 'gift_sent', description: 'Sent Teddy Bear 🧸 to Aisha Malik',          createdAt: daysAgo(9)  },
    { walletId: walletIds[IDS.user2], transactionType: 'credit', currency: 'coins', amount: 10000, balanceAfter: 15951, reference: 'top_up',    description: 'Ultimate Pack — 10,000 + 3,000 bonus coins', createdAt: daysAgo(3)  },
    // host1 bean earnings
    { walletId: walletIds[IDS.host1], transactionType: 'credit', currency: 'beans', amount: 35000, balanceAfter: 35000, reference: 'gift_received', description: 'Received Magic Lamp 🧞 from Raj Kumar',   createdAt: daysAgo(5)  },
    { walletId: walletIds[IDS.host1], transactionType: 'credit', currency: 'beans', amount: 700,   balanceAfter: 35700, reference: 'gift_received', description: 'Received Crown 👑 from Emma White',       createdAt: daysAgo(4)  },
    { walletId: walletIds[IDS.host1], transactionType: 'debit',  currency: 'beans', amount: 50000, balanceAfter: 22000, reference: 'withdrawal_hold', description: 'Withdrawal hold — 50,000 beans',           createdAt: daysAgo(2)  },
    // agent1 commission
    { walletId: walletIds[IDS.agent1], transactionType: 'credit', currency: 'beans', amount: 10000, balanceAfter: 10000, reference: 'gift_commission', description: "Commission from Yuki Tanaka's gift",   createdAt: daysAgo(5)  },
    { walletId: walletIds[IDS.agent1], transactionType: 'credit', currency: 'beans', amount: 1400,  balanceAfter: 11400, reference: 'gift_commission', description: "Commission from Aisha Malik's gift",   createdAt: daysAgo(4)  },
  ];

  for (const tx of walletTxs) {
    await prisma.walletTransaction.create({ data: tx }).catch(() => {});
  }

  // ── 6. Rooms ─────────────────────────────────────────────────────────────────
  console.log('→ Rooms...');
  const rooms = [
    { id: IDS.room1, hostId: IDS.host1,  title: 'Chill Vibes Only 🎵',     category: 'music',     status: 'live',  micConfig: 5,  viewerCount: 47, agoraChannel: IDS.room1, startedAt: daysAgo(0) },
    { id: IDS.room2, hostId: IDS.host3,  title: 'Late Night Talk Show 🌙',  category: 'talk',      status: 'live',  micConfig: 10, viewerCount: 83, agoraChannel: IDS.room2, startedAt: daysAgo(0) },
    { id: IDS.room3, hostId: IDS.ihost1, title: 'Gaming with Leo ⚡',       category: 'gaming',    status: 'ended', micConfig: 5,  viewerCount: 0,  agoraChannel: IDS.room3, startedAt: daysAgo(1), endedAt: daysAgo(1) },
    { id: IDS.room4, hostId: IDS.host2,  title: "Aisha's Beauty Hour 💄",   category: 'general',   status: 'ended', micConfig: 10, viewerCount: 0,  agoraChannel: IDS.room4, startedAt: daysAgo(2), endedAt: daysAgo(2) },
    { id: IDS.room5, hostId: IDS.ihost2, title: 'Study With Me 📚',         category: 'education', status: 'idle',  micConfig: 5,  viewerCount: 0,  agoraChannel: IDS.room5 },
  ];
  for (const r of rooms) {
    await prisma.room.upsert({
      where: { id: r.id },
      update: {},
      create: r,
    });
  }

  // ── 7. Gift Transactions ─────────────────────────────────────────────────────
  console.log('→ Gift transactions...');
  const gifts = await prisma.gift.findMany({ select: { id: true, name: true, coinCost: true, beanValue: true } });
  const crown   = gifts.find(g => g.name === 'Crown');
  const rocket  = gifts.find(g => g.name === 'Rocket');
  const teddy   = gifts.find(g => g.name === 'Teddy Bear');
  const diamond = gifts.find(g => g.name === 'Diamond');
  const heart   = gifts.find(g => g.name === 'Heart');

  if (crown && rocket && teddy && diamond && heart) {
    const giftTxs = [
      { senderId: IDS.user1, recipientId: IDS.host1,  giftId: crown.id,   roomId: IDS.room1, coinCost: crown.coinCost,   beanValue: crown.beanValue,   createdAt: daysAgo(6) },
      { senderId: IDS.user1, recipientId: IDS.host3,  giftId: rocket.id,  roomId: IDS.room2, coinCost: rocket.coinCost,  beanValue: rocket.beanValue,  createdAt: daysAgo(4) },
      { senderId: IDS.user2, recipientId: IDS.host2,  giftId: teddy.id,   roomId: IDS.room4, coinCost: teddy.coinCost,   beanValue: teddy.beanValue,   createdAt: daysAgo(9) },
      { senderId: IDS.user3, recipientId: IDS.ihost1, giftId: diamond.id, roomId: IDS.room3, coinCost: diamond.coinCost, beanValue: diamond.beanValue, createdAt: daysAgo(3) },
      { senderId: IDS.user4, recipientId: IDS.host1,  giftId: heart.id,   roomId: IDS.room1, coinCost: heart.coinCost,   beanValue: heart.beanValue,   createdAt: daysAgo(1) },
      { senderId: IDS.user2, recipientId: IDS.host3,  giftId: crown.id,   roomId: IDS.room2, coinCost: crown.coinCost,   beanValue: crown.beanValue,   createdAt: daysAgo(2) },
      { senderId: IDS.user5, recipientId: IDS.ihost2, giftId: heart.id,   roomId: null,      coinCost: heart.coinCost,   beanValue: heart.beanValue,   createdAt: daysAgo(5) },
    ];
    for (const tx of giftTxs) {
      await prisma.giftTransaction.create({ data: tx }).catch(() => {});
    }
  } else {
    console.log('  ⚠ Run the main seed first (npx prisma db seed) to create gifts');
  }

  // ── 8. Payment Transactions ──────────────────────────────────────────────────
  console.log('→ Payment transactions...');
  const paymentTxs = [
    { userId: IDS.user1, packageId: IDS.pkg6, method: 'card',       stripePaymentIntentId: 'pi_demo_001', amountGbp: 69.99, status: 'succeeded', coinsCredited: true,  createdAt: daysAgo(14) },
    { userId: IDS.user1, packageId: IDS.pkg4, method: 'google_pay', stripePaymentIntentId: 'pi_demo_002', amountGbp: 19.99, status: 'succeeded', coinsCredited: true,  createdAt: daysAgo(7)  },
    { userId: IDS.user1, packageId: IDS.pkg5, method: 'apple_pay',  stripePaymentIntentId: 'pi_demo_003', amountGbp: 39.99, status: 'succeeded', coinsCredited: true,  createdAt: daysAgo(2)  },
    { userId: IDS.user2, packageId: IDS.pkg5, method: 'card',       stripePaymentIntentId: 'pi_demo_004', amountGbp: 39.99, status: 'succeeded', coinsCredited: true,  createdAt: daysAgo(10) },
    { userId: IDS.user2, packageId: IDS.pkg6, method: 'card',       stripePaymentIntentId: 'pi_demo_005', amountGbp: 69.99, status: 'succeeded', coinsCredited: true,  createdAt: daysAgo(3)  },
    { userId: IDS.user3, packageId: IDS.pkg3, method: 'apple_pay',  stripePaymentIntentId: 'pi_demo_006', amountGbp: 8.99,  status: 'succeeded', coinsCredited: true,  createdAt: daysAgo(8)  },
    { userId: IDS.user4, packageId: IDS.pkg2, method: 'card',       stripePaymentIntentId: 'pi_demo_007', amountGbp: 4.99,  status: 'succeeded', coinsCredited: true,  createdAt: daysAgo(5)  },
    { userId: IDS.user5, packageId: IDS.pkg1, method: 'card',       stripePaymentIntentId: 'pi_demo_008', amountGbp: 0.99,  status: 'succeeded', coinsCredited: true,  createdAt: daysAgo(3)  },
    { userId: IDS.user3, packageId: IDS.pkg4, method: 'google_pay', stripePaymentIntentId: 'pi_demo_009', amountGbp: 19.99, status: 'failed',     coinsCredited: false, createdAt: daysAgo(6)  },
  ];
  for (const tx of paymentTxs) {
    await prisma.paymentTransaction.upsert({
      where: { stripePaymentIntentId: tx.stripePaymentIntentId },
      update: {},
      create: tx,
    });
  }

  // ── 9. Withdrawal Requests ───────────────────────────────────────────────────
  console.log('→ Withdrawal requests...');
  const withdrawals = [
    { userId: IDS.host1,   beansAmount: 50000,  status: 'pending_review',  notes: '',                    createdAt: daysAgo(2) },
    { userId: IDS.host3,   beansAmount: 80000,  status: 'pending_review',  notes: '',                    createdAt: daysAgo(1) },
    { userId: IDS.ihost1,  beansAmount: 30000,  status: 'approved', notes: 'Processed via bank',  createdAt: daysAgo(5),  processedAt: daysAgo(4) },
    { userId: IDS.host2,   beansAmount: 20000,  status: 'approved', notes: 'Bank transfer done',  createdAt: daysAgo(8),  processedAt: daysAgo(7) },
    { userId: IDS.ihost2,  beansAmount: 15000,  status: 'rejected', notes: 'Insufficient beans after audit', createdAt: daysAgo(10), processedAt: daysAgo(9) },
  ];
  const { generateUniqueWithdrawalOrderId } = await import('../src/utils/withdrawal-order-id');
  for (const w of withdrawals) {
    const orderId = await generateUniqueWithdrawalOrderId();
    await prisma.withdrawalRequest.create({ data: { ...w, orderId } }).catch(() => {});
  }

  // ── 10. Host Applications ─────────────────────────────────────────────────────
  console.log('→ Host applications...');
  const applications = [
    { userId: IDS.user3, agentId: IDS.agent1, path: 'self_apply_with_agent', status: 'pending',  note: '',                    createdAt: daysAgo(1) },
    { userId: IDS.user4, agentId: null,        path: 'self_apply_independent', status: 'pending', note: '',                    createdAt: daysAgo(3) },
    { userId: IDS.user5, agentId: IDS.agent2,  path: 'agency_invitation',    status: 'approved', note: 'Approved by admin',   createdAt: daysAgo(7), reviewedAt: daysAgo(6) },
  ];
  for (const app of applications) {
    await prisma.hostApplication.create({ data: app }).catch(() => {});
  }

  // ── 11. Families ─────────────────────────────────────────────────────────────
  console.log('→ Families...');
  await prisma.family.upsert({
    where: { id: IDS.fam1 },
    update: {},
    create: {
      id: IDS.fam1, name: 'Golden Stars', ownerId: IDS.ihost1, tier: 'gold',
      badge: '⭐', announcement: 'Welcome to Golden Stars family! Let\'s grow together.',
      weeklyBeans: 185000, totalBeans: 920000,
    },
  });
  await prisma.family.upsert({
    where: { id: IDS.fam2 },
    update: {},
    create: {
      id: IDS.fam2, name: 'Night Owls', ownerId: IDS.host3, tier: 'silver',
      badge: '🦉', announcement: 'Night Owls — streaming after midnight.',
      weeklyBeans: 62000, totalBeans: 310000,
    },
  });

  // Family members
  const familyMembers = [
    { familyId: IDS.fam1, userId: IDS.ihost1, role: 'owner' },
    { familyId: IDS.fam1, userId: IDS.host1,  role: 'admin' },
    { familyId: IDS.fam1, userId: IDS.user1,  role: 'member' },
    { familyId: IDS.fam2, userId: IDS.host3,  role: 'owner' },
    { familyId: IDS.fam2, userId: IDS.host4,  role: 'admin' },
    { familyId: IDS.fam2, userId: IDS.user2,  role: 'member' },
  ];
  for (const m of familyMembers) {
    await prisma.familyMember.upsert({
      where: { userId: m.userId },
      update: {},
      create: m,
    });
  }

  await prisma.$executeRaw`
    SELECT setval('"public_haka_id_seq"'::regclass, ${BigInt(500_000_032)}, true)
  `;

  console.log('\n✅ Demo seed complete!');
  console.log('   13 users  •  13 wallets  •  5 rooms  •  7 gift transactions');
  console.log('   9 payment transactions  •  5 withdrawal requests  •  3 host applications');
  console.log('   2 families  •  6 coin packages');

  const { seedRegionalEarnerRedisScores } = await import('./seed-regional-earner-redis');
  await seedRegionalEarnerRedisScores([
    { userId: IDS.user1, country: 'IN', city: 'Delhi', beans: 400 },
    { userId: IDS.user2, country: 'IN', city: 'Delhi', beans: 300 },
    { userId: IDS.user3, country: 'IN', city: 'Delhi', beans: 200 },
    { userId: IDS.host1, country: 'IN', city: 'Delhi', beans: 100 },
    { userId: IDS.user4, country: 'US', city: 'Austin', beans: 400 },
    { userId: IDS.host3, country: 'US', city: 'Austin', beans: 300 },
  ]);
}

main()
  .catch((e) => { console.error('❌ Demo seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
