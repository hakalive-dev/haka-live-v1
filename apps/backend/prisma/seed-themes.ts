import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const THEMES = [
  // ── Free themes ─────────────────────────────────────────────────────────────
  {
    name: 'Midnight Purple',
    gradientFrom: '#1E1A3C',
    gradientTo: '#2A2550',
    accentColor: '#7B4FFF',
    chatBubbleColor: '#2A2550',
    coinCost: null,
  },
  {
    name: 'Deep Ocean',
    gradientFrom: '#0A1628',
    gradientTo: '#0D2B4E',
    accentColor: '#4DA6FF',
    chatBubbleColor: '#0D2B4E',
    coinCost: null,
  },
  // ── Paid themes ─────────────────────────────────────────────────────────────
  {
    name: 'Rose Gold',
    gradientFrom: '#2C1215',
    gradientTo: '#4A1E24',
    accentColor: '#E8748A',
    chatBubbleColor: '#4A1E24',
    coinCost: 500,
  },
  {
    name: 'Aurora',
    gradientFrom: '#0B2027',
    gradientTo: '#1A3A2A',
    accentColor: '#22C97A',
    chatBubbleColor: '#1A3A2A',
    coinCost: 500,
  },
  {
    name: 'Golden Hour',
    gradientFrom: '#1E1200',
    gradientTo: '#3D2800',
    accentColor: '#E8A020',
    chatBubbleColor: '#3D2800',
    coinCost: 1000,
  },
  {
    name: 'Crimson Night',
    gradientFrom: '#1A0505',
    gradientTo: '#3D0A0A',
    accentColor: '#FF4D4D',
    chatBubbleColor: '#3D0A0A',
    coinCost: 1000,
  },
  {
    name: 'Cosmic',
    gradientFrom: '#050520',
    gradientTo: '#0D0D3D',
    accentColor: '#9D7FFF',
    chatBubbleColor: '#0D0D3D',
    coinCost: 2000,
  },
  {
    name: 'Sakura',
    gradientFrom: '#1E0A14',
    gradientTo: '#3D1528',
    accentColor: '#FF69B4',
    chatBubbleColor: '#3D1528',
    coinCost: 2000,
  },
];

async function main() {
  console.log('Seeding themes...');

  for (const t of THEMES) {
    const existing = await prisma.theme.findFirst({ where: { name: t.name } });
    if (existing) {
      console.log(`  skip: "${t.name}" already exists`);
      continue;
    }

    let storeItemId: string | undefined;

    if (t.coinCost !== null) {
      const item = await prisma.storeItem.create({
        data: {
          name: `${t.name} Theme`,
          description: `Apply the ${t.name} theme to your room`,
          category: 'theme',
          coinCost: t.coinCost,
          durationDays: 0,
          isActive: true,
        },
      });
      storeItemId = item.id;
    }

    await prisma.theme.create({
      data: {
        name: t.name,
        gradientFrom: t.gradientFrom,
        gradientTo: t.gradientTo,
        accentColor: t.accentColor,
        chatBubbleColor: t.chatBubbleColor,
        storeItemId: storeItemId ?? null,
      },
    });

    console.log(`  created: "${t.name}" ${t.coinCost ? `(${t.coinCost} coins)` : '(free)'}`);
  }

  console.log('Done.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
