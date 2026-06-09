import { prisma } from '../../config/prisma';

/** Start PK presence for both hosts when a match becomes active. */
export async function startPkPresenceForMatch(
  pkMatchId: string,
  hostAId: string,
  hostBId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.hostPkPresenceSession.create({
      data: { userId: hostAId, pkMatchId },
    }),
    prisma.hostPkPresenceSession.create({
      data: { userId: hostBId, pkMatchId },
    }),
  ]);
}

/** Finalize all open PK presence rows for a match. */
export async function endPkPresenceForMatch(pkMatchId: string): Promise<void> {
  const open = await prisma.hostPkPresenceSession.findMany({
    where: { pkMatchId, endedAt: null },
  });
  const endedAt = new Date();
  await Promise.all(
    open.map((s) => {
      const minutes = Math.max(
        0,
        Math.floor((endedAt.getTime() - s.startedAt.getTime()) / 60000),
      );
      return prisma.hostPkPresenceSession.update({
        where: { id: s.id },
        data: { endedAt, minutes },
      });
    }),
  );
}
