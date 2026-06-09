import { prisma } from '../../config/prisma';

/** Resolve a public agent id (UUID, hakaId, or username) to internal user id. */
export async function resolveAgentUserId(raw: string): Promise<string | null> {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const u = await prisma.user.findFirst({
    where: {
      role: 'agent',
      OR: [
        { id: trimmed },
        { username: trimmed },
        { hakaId: { equals: trimmed, mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
  return u?.id ?? null;
}
