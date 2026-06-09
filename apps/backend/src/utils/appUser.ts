import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/error.middleware';
import { generateUniqueHakaId } from './hakaId';

export interface LinkAppUserInput {
  mode: 'link';
  hakaId: string;
}

export interface CreateAppUserInput {
  mode: 'create';
  displayName: string;
  phone?: string | null;
  username?: string | null;
  country?: string | null;
}

export type ResolveAppUserInput = LinkAppUserInput | CreateAppUserInput;

export interface ResolvedAppUser {
  id: string;
  hakaId: string | null;
  displayName: string;
}

/**
 * Link an existing app user by Haka ID, or create a fresh app account.
 * Used by Create-BD and Create-Agency so the entity's "Haka ID" is a real User.hakaId.
 */
export async function resolveOrCreateAppUser(input: ResolveAppUserInput): Promise<ResolvedAppUser> {
  if (input.mode === 'link') {
    const user = await prisma.user.findUnique({
      where: { hakaId: input.hakaId },
      select: { id: true, hakaId: true, displayName: true },
    });
    if (!user) throw new AppError(`App user with Haka ID ${input.hakaId} not found`, 404);
    return user;
  }

  // Pre-check phone/username for a friendly 409. The DB unique constraints
  // (User.phone/username/hakaId) are the real backstop: a concurrent create that
  // slips past these checks is caught by the P2002 handler below.
  if (input.phone) {
    const dupePhone = await prisma.user.findUnique({ where: { phone: input.phone }, select: { id: true } });
    if (dupePhone) throw new AppError('A user with this phone already exists', 409);
  }
  if (input.username) {
    const dupeName = await prisma.user.findUnique({ where: { username: input.username }, select: { id: true } });
    if (dupeName) throw new AppError('A user with this username already exists', 409);
  }

  const hakaId = await generateUniqueHakaId();
  try {
    return await prisma.user.create({
      data: {
        displayName: input.displayName,
        phone: input.phone ?? null,
        username: input.username ?? null,
        country: input.country ?? '',
        hakaId,
      },
      select: { id: true, hakaId: true, displayName: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = err.meta?.target;
      const field = Array.isArray(target) ? target.join(', ') : String(target ?? 'field');
      throw new AppError(`A user with this ${field} already exists`, 409);
    }
    throw err;
  }
}
