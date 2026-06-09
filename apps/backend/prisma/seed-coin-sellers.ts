import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const publicHakaId = (n: number) => String(500_000_000 + n);

const SELLERS = [
  { id: 'c5e11001-0000-0000-0000-000000000001', name: 'Raj',     hakaId: publicHakaId(33), wa: '+919812345001', methods: 'upi,epay,usdt,usdc',     price: 0.0010, level: 'Gold'   },
  { id: 'c5e11001-0000-0000-0000-000000000002', name: 'Priya',   hakaId: publicHakaId(34), wa: '+919812345002', methods: 'upi,usdt',              price: 0.0011, level: 'Silver' },
  { id: 'c5e11001-0000-0000-0000-000000000003', name: 'Arjun',   hakaId: publicHakaId(35), wa: '+919812345003', methods: 'upi,epay',              price: 0.0009, level: 'Bronze' },
  { id: 'c5e11001-0000-0000-0000-000000000004', name: 'Meera',   hakaId: publicHakaId(36), wa: '+919812345004', methods: 'upi,usdt,usdc',          price: 0.0010, level: 'Silver' },
  { id: 'c5e11001-0000-0000-0000-000000000005', name: 'Vikram',  hakaId: publicHakaId(37), wa: '+919812345005', methods: 'upi,epay,usdt,usdc',     price: 0.0012, level: 'Gold'   },
  { id: 'c5e11001-0000-0000-0000-000000000006', name: 'Anaya',   hakaId: publicHakaId(38), wa: '+919812345006', methods: 'upi,usdc',              price: 0.0010, level: 'Bronze' },
  { id: 'c5e11001-0000-0000-0000-000000000007', name: 'Kabir',   hakaId: publicHakaId(39), wa: '+919812345007', methods: 'upi,epay,usdt',         price: 0.0011, level: 'Silver' },
];

async function main() {
  for (const s of SELLERS) {
    await prisma.user.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        supabaseUid: `seed-cs-${s.hakaId}`,
        username: s.name.toLowerCase(),
        displayName: s.name,
        avatar: `https://i.pravatar.cc/200?u=cs-${s.hakaId}`,
        hakaId: s.hakaId,
        country: 'India',
        role: 'normal_user',
        onboardingComplete: true,
      },
      update: { displayName: s.name, hakaId: s.hakaId, avatar: `https://i.pravatar.cc/200?u=cs-${s.hakaId}` },
    });

    await prisma.coinSellerProfile.upsert({
      where: { userId: s.id },
      create: {
        userId: s.id,
        whatsappNumber: s.wa,
        sellerLevel: s.level,
        paymentMethods: s.methods,
        pricePerCoin: s.price,
        countryCode: 'IN',
        availableBalance: 1_000_000,
        totalBalance: 5_000_000,
        totalCoinsSold: 250_000 + Math.floor(Math.random() * 750_000),
        totalCustomers: 50 + Math.floor(Math.random() * 200),
      },
      update: {
        whatsappNumber: s.wa,
        sellerLevel: s.level,
        paymentMethods: s.methods,
        pricePerCoin: s.price,
        countryCode: 'IN',
      },
    });
  }
  await prisma.$executeRaw`
    SELECT setval('"public_haka_id_seq"'::regclass, ${BigInt(500_000_039)}, true)
  `;
  console.log(`Seeded ${SELLERS.length} coin sellers.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
