import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';

export async function getUserMusicLibrary(userId: string, search?: string) {
  const where: Record<string, unknown> = { userId };
  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }
  return prisma.userMusicTrack.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, url: true, mimeType: true, createdAt: true },
  });
}

export async function addToUserMusicLibrary(
  userId: string,
  url: string,
  name: string,
  mimeType: string,
) {
  return prisma.userMusicTrack.create({
    data: { userId, url, name, mimeType },
  });
}

export async function deleteFromUserMusicLibrary(userId: string, trackId: string) {
  const track = await prisma.userMusicTrack.findFirst({ where: { id: trackId, userId } });
  if (!track) throw new AppError('Track not found', 404);
  await prisma.userMusicTrack.delete({ where: { id: trackId } });
}
