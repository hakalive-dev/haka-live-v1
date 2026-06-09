/**
 * Local seeder — verified female host (FemaleHostTaskScreen, level tasks).
 *
 * Run (docker dev stack up):
 *   docker compose -f docker-compose.dev.yml exec backend \
 *     npx ts-node prisma/seed-female-host.ts
 *
 * Or from apps/backend:
 *   npm run seed:female-host
 *
 * Login: Haka ID 500000099 · password DEV_LOGIN_PASSWORD (default haka2024)
 * Safe to re-run: upserts throughout.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const FEMALE_HOST_ID = '88888888-8888-4888-8888-800001000001';
const HAKA_ID = '500000099';
const ROOM_ID = '620001';
const FIREBASE_UID = 'dev-female-host';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

async function main() {
  console.log('🌱 Seeding verified female host...\n');

  const devPassword = process.env.DEV_LOGIN_PASSWORD ?? 'haka2024';
  const devPasswordHash = await bcrypt.hash(devPassword, 10);
  const femaleHostCreatedAt = daysAgo(30);

  await prisma.user.upsert({
    where: { id: FEMALE_HOST_ID },
    update: {
      supabaseUid: FIREBASE_UID,
      password: devPasswordHash,
      role: 'host',
      hostType: 'independent',
      hostApplicationPath: 'self_apply_independent',
      gender: 'female',
      isVerifiedHost: true,
      onboardingComplete: true,
      displayName: 'Maya Host',
      username: 'maya_host',
      hakaId: HAKA_ID,
      avatar: 'https://i.pravatar.cc/150?u=maya_host',
      country: 'PH',
      bio: 'Verified female host · local dev seed',
      createdAt: femaleHostCreatedAt,
    },
    create: {
      id: FEMALE_HOST_ID,
      supabaseUid: FIREBASE_UID,
      password: devPasswordHash,
      role: 'host',
      hostType: 'independent',
      hostApplicationPath: 'self_apply_independent',
      gender: 'female',
      isVerifiedHost: true,
      onboardingComplete: true,
      displayName: 'Maya Host',
      username: 'maya_host',
      hakaId: HAKA_ID,
      avatar: 'https://i.pravatar.cc/150?u=maya_host',
      country: 'PH',
      bio: 'Verified female host · local dev seed',
      createdAt: femaleHostCreatedAt,
    },
  });

  await prisma.wallet.upsert({
    where: { userId: FEMALE_HOST_ID },
    update: { coinBalance: 50_000, beanBalance: 120_000 },
    create: { userId: FEMALE_HOST_ID, coinBalance: 50_000, beanBalance: 120_000 },
  });

  await prisma.userLevel.upsert({
    where: { userId: FEMALE_HOST_ID },
    update: {
      richLevel: 8,
      richXp: 55_000,
      charmLevel: 12,
      charmXp: 140_000,
    },
    create: {
      userId: FEMALE_HOST_ID,
      richLevel: 8,
      richXp: 55_000,
      charmLevel: 12,
      charmXp: 140_000,
    },
  });

  await prisma.room.upsert({
    where: { id: ROOM_ID },
    update: { hostId: FEMALE_HOST_ID, status: 'live' },
    create: {
      id: ROOM_ID,
      hostId: FEMALE_HOST_ID,
      title: "Maya's Live Room",
      description: 'Female host task test room',
      category: 'music',
      type: 'public',
      status: 'live',
      roomMode: 'chat',
      micConfig: 5,
      viewerCount: 12,
      agoraChannel: ROOM_ID,
      startedAt: hoursAgo(1),
    },
  });

  await prisma.roomSeat.upsert({
    where: { roomId_position: { roomId: ROOM_ID, position: 1 } },
    update: { userId: FEMALE_HOST_ID },
    create: { roomId: ROOM_ID, position: 1, userId: FEMALE_HOST_ID, isMuted: false },
  });

  const micStarted = new Date(Date.now() - 45 * 60 * 1000);
  await prisma.hostMicSession.deleteMany({ where: { userId: FEMALE_HOST_ID } });
  await prisma.hostMicSession.create({
    data: {
      userId: FEMALE_HOST_ID,
      roomId: ROOM_ID,
      roomMode: 'chat',
      seatIndex: 0,
      startedAt: micStarted,
      endedAt: new Date(),
      minutes: 45,
      beansAwarded: 0,
    },
  });

  console.log('✅ Female host seed complete!\n');
  console.log('════════════════════════════════════════════');
  console.log(`  Haka ID  : ${HAKA_ID}`);
  console.log(`  Password : ${devPassword}`);
  console.log('  Display  : Maya Host (@maya_host)');
  console.log('  Role     : host (independent, female, verified)');
  console.log('  Wallet   : 50,000 coins · 120,000 beans');
  console.log(`  Live room: "${ROOM_ID}" — 45 min mic today (level tasks)`);
  console.log('  Login    : app → Login with Haka ID');
  console.log('════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('❌ Female host seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
