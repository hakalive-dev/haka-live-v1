import { prisma } from '../../config/prisma';
import { userSummarySelect, serializeUserSummary } from '../users/user-summary';

function publicUserSelect() {
  return {
    id: true,
    username: true,
    displayName: true,
    avatar: true,
    hakaId: true,
    activeSpecialId: true,
    activeSpecialIdLevel: true,
    activeSpecialIdExpiresAt: true,
    country: true,
    bio: true,
    role: true,
    isActive: true,
    createdAt: true,
    level: { select: { richLevel: true, charmLevel: true } },
    storeItems: {
      where: {
        isEquipped: true,
        item: { category: 'frame' },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: {
        item: { select: { id: true, name: true, image: true, category: true, level: true } },
      },
    },
  };
}

export const searchService = {
  async global(query: string, type: 'all' | 'users' | 'rooms') {
    const q = query.trim();
    if (!q) return { users: [], rooms: [] };

    const [users, rooms] = await Promise.all([
      type !== 'rooms'
        ? prisma.user.findMany({
            where: {
              isActive: true,
              profileHidden: false,
              OR: [
                { displayName: { contains: q, mode: 'insensitive' } },
                { username: { contains: q, mode: 'insensitive' } },
                { hakaId: { contains: q, mode: 'insensitive' } },
                { activeSpecialId: { contains: q, mode: 'insensitive' }, activeSpecialIdExpiresAt: { gt: new Date() } },
              ],
            },
            select: publicUserSelect(),
            take: 20,
          })
        : [],
      type !== 'users'
        ? prisma.room.findMany({
            where: {
              status: { not: 'ended' },
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            },
            include: {
              host: { select: userSummarySelect() },
              _count: { select: { seats: true } },
            },
            take: 20,
          })
        : [],
    ]);

    return {
      users: users.map((u) => {
        const summary = serializeUserSummary(u);
        return {
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          avatar: u.avatar || null,
          hakaId: u.hakaId,
          country: u.country,
          bio: u.bio,
          role: u.role,
          isActive: u.isActive,
          createdAt: u.createdAt.toISOString(),
          richLevel: u.level?.richLevel ?? 1,
          charmLevel: u.level?.charmLevel ?? 1,
          equippedFrame: summary.equippedFrame,
          equippedRing: summary.equippedRing,
          equippedChatBubble: summary.equippedChatBubble,
          equippedMicVoiceWave: summary.equippedMicVoiceWave,
          equippedProfileCard: summary.equippedProfileCard,
          equippedDynamicProfile: summary.equippedDynamicProfile,
          activeSpecialId: summary.activeSpecialId,
          activeSpecialIdLevel: summary.activeSpecialIdLevel,
        };
      }),
      rooms: rooms.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        coverImage: r.coverImage || null,
        category: r.category,
        type: r.type,
        roomMode: r.roomMode ?? 'chat',
        status: r.status,
        micConfig: r.micConfig,
        viewerCount: r.viewerCount,
        host: serializeUserSummary(r.host),
        createdAt: r.createdAt.toISOString(),
      })),
    };
  },
};
