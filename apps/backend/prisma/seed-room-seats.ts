/**
 * Backfill room seats for every room in the database.
 * Run after seed.ts / seed-demo.ts / seed-testuser.ts:
 *   docker compose -f docker-compose.dev.yml exec backend npx ts-node prisma/seed-room-seats.ts
 *
 * Idempotent: creates missing seat rows; fills empty seats with demo users; keeps existing occupants.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🪑 Seeding room seats for all rooms...\n');

  const rooms = await prisma.room.findMany({
    include: { seats: { orderBy: { position: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });

  if (rooms.length === 0) {
    console.log('No rooms found — run seed.ts or seed-demo.ts first.');
    return;
  }

  const fillerUsers = await prisma.user.findMany({
    where: {
      onboardingComplete: true,
      profileHidden: false,
      isActive: true,
    },
    select: { id: true },
    take: 30,
  });
  const fillerIds = fillerUsers.map((u) => u.id);

  let roomsUpdated = 0;

  for (const room of rooms) {
    const seatByPosition = new Map(room.seats.map((s) => [s.position, s]));
    const assigned = new Set<string>();

    // Host always occupies seat 1 when possible.
    if (room.hostId) assigned.add(room.hostId);

    for (let position = 1; position <= room.micConfig; position++) {
      const existing = seatByPosition.get(position);
      const existingUserId = existing?.userId ?? null;
      if (existingUserId) assigned.add(existingUserId);

      let userId: string | null;
      if (position === 1) {
        userId = room.hostId;
      } else if (existingUserId) {
        userId = existingUserId;
      } else {
        userId = fillerIds.find((id) => id !== room.hostId && !assigned.has(id)) ?? null;
        if (userId) assigned.add(userId);
      }

      await prisma.roomSeat.upsert({
        where: { roomId_position: { roomId: room.id, position } },
        update: existingUserId ? {} : { userId },
        create: {
          roomId: room.id,
          position,
          userId,
          isLocked: false,
          isMuted: false,
        },
      });
    }

    const occupied = await prisma.roomSeat.count({
      where: { roomId: room.id, userId: { not: null } },
    });
    console.log(`  ${room.title} (${room.status}) — ${occupied}/${room.micConfig} seats filled`);
    roomsUpdated++;
  }

  console.log(`\n✅ Room seats ready for ${roomsUpdated} room(s).`);
}

main()
  .catch((e) => {
    console.error('❌ seed-room-seats failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
