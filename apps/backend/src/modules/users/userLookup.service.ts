import { prisma } from "../../config/prisma";

/**
 * Resolve a user id from internal UUID, public hakaId, or username (case-insensitive).
 */
export async function resolveUserIdFromPublicIdentifier(
  raw: string,
): Promise<string | null> {
  const t = raw.trim();
  if (!t) return null;
  const u = await prisma.user.findFirst({
    where: {
      OR: [
        { id: t },
        { hakaId: t },
        { username: { equals: t, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  return u?.id ?? null;
}
