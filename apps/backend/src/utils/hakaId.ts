import { prisma } from '../config/prisma';

/** First public Haka ID issued to new users (onboarding / dev signup). Sequence runs 500000001, 500000002, … */
export const HAKA_ID_SEQUENCE_START = 500_000_001;

/** Postgres sequence backing {@link generateUniqueHakaId} (see migration `20260507150000_public_haka_id_seq`). */
export const PUBLIC_HAKA_ID_SEQUENCE_NAME = 'public_haka_id_seq';

// Arbitrary stable lock key for pg_advisory_xact_lock (must be consistent across deployments).
const HAKA_ID_LOCK_KEY = 1_746_000_001;

/** Guard against pathological collision loops (should never hit in practice). */
const MAX_ALLOCATION_ATTEMPTS = 50_000;

// Generates the next sequential numeric hakaId from Postgres sequence public_haka_id_seq,
// skipping values already present on users or admin staff (fixed seeds / legacy rows in the same numeric space).
// Uses a Postgres advisory transaction lock so concurrent signups serialize safely.
export async function generateUniqueHakaId(): Promise<string> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${HAKA_ID_LOCK_KEY})`;

    for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt++) {
      const rows = await tx.$queryRaw<{ next_val: bigint }[]>`
        SELECT nextval('"public_haka_id_seq"'::regclass)::bigint AS next_val
      `;
      const raw = rows[0]?.next_val;
      if (raw === undefined) {
        throw new Error('generateUniqueHakaId: nextval returned no row');
      }
      const candidate = typeof raw === 'bigint' ? raw.toString() : String(raw);

      const existingUser = await tx.user.findUnique({
        where: { hakaId: candidate },
        select: { id: true },
      });
      if (existingUser) continue;

      const existingAdmin = await tx.adminUser.findFirst({
        where: { hakaId: candidate },
        select: { id: true },
      });
      if (!existingAdmin) {
        if (!/^\d{9}$/.test(candidate) || candidate < '500000001' || candidate > '999999999') {
          throw new Error(`generateUniqueHakaId: invalid public id ${candidate}`);
        }
        return candidate;
      }
    }

    throw new Error('generateUniqueHakaId: exhausted allocation attempts');
  });
}
