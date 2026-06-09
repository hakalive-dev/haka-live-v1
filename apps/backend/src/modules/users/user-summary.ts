import type { Prisma } from '@prisma/client';
import { resolvePublicAssetUrl } from '../../utils/storage';

// Shape of an equipped cosmetic attached to a user summary.
export interface EquippedCosmetic {
  id: string;
  name: string;
  image: string | null;
  /** Static PNG/JPG thumbnail — used for chat-bubble frames and store previews. */
  previewImage: string | null;
  category: string;
  level: string;
}

/** Categories surfaced on user summaries (room seats, chat, profile, etc.). */
export const EQUIPPED_COSMETIC_CATEGORIES = [
  'frame',
  'ring',
  'chat_bubble',
  'mic_voice_wave',
  'profile_card',
  'dynamic_profile',
] as const;

export type EquippedCosmeticCategory = (typeof EQUIPPED_COSMETIC_CATEGORIES)[number];

export interface EquippedCosmetics {
  equippedFrame: EquippedCosmetic | null;
  equippedRing: EquippedCosmetic | null;
  equippedChatBubble: EquippedCosmetic | null;
  equippedMicVoiceWave: EquippedCosmetic | null;
  equippedProfileCard: EquippedCosmetic | null;
  equippedDynamicProfile: EquippedCosmetic | null;
}

export interface UserSummary extends EquippedCosmetics {
  id: string;
  username: string | null;
  displayName: string;
  avatar: string;
  // Display value: activeSpecialId (6-digit) if set, else the user's hakaId.
  hakaId: string | null;
  // Always the user record's auto-generated hakaId, regardless of equipped cosmetics.
  originalHakaId: string | null;
  // Active special ID number (6-digit), null if none active.
  activeSpecialId: string | null;
  // Tier level of the active special ID (SSS/SS/S/A/B), null if none.
  activeSpecialIdLevel: string | null;
  richLevel: number;
  charmLevel: number;
  /** ISO or display country from User.country when selected (e.g. live room list). */
  country?: string;
  /** City label for regional leaderboard / location when selected. */
  city?: string;
  /** True for system accounts (e.g. Haka Team) — hide profile navigation / replies */
  profileHidden?: boolean;
}

const STORE_ITEM_ITEM_SELECT = {
  id: true,
  name: true,
  image: true,
  previewImage: true,
  category: true,
  level: true,
} as const;

type RawStoreItemRow = {
  item: {
    id: string;
    name: string;
    image: string | null;
    previewImage?: string | null;
    category: string;
    level: string;
  };
};

function formatEquippedStoreItem(item: RawStoreItemRow['item']): EquippedCosmetic {
  return {
    id: item.id,
    name: item.name,
    image: item.image ? resolvePublicAssetUrl(item.image) : null,
    previewImage: item.previewImage ? resolvePublicAssetUrl(item.previewImage) : null,
    category: item.category,
    level: item.level,
  };
}

/** Prisma `where` for equipped, non-expired wearable store items. */
export function equippedStoreItemsWhere() {
  return {
    isEquipped: true,
    item: { category: { in: [...EQUIPPED_COSMETIC_CATEGORIES] } },
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };
}

export function parseEquippedCosmetics(storeItems: RawStoreItemRow[]): EquippedCosmetics {
  const pick = (category: EquippedCosmeticCategory): EquippedCosmetic | null => {
    const row = storeItems.find((ui) => ui.item.category === category);
    return row ? formatEquippedStoreItem(row.item) : null;
  };
  return {
    equippedFrame: pick('frame'),
    equippedRing: pick('ring'),
    equippedChatBubble: pick('chat_bubble'),
    equippedMicVoiceWave: pick('mic_voice_wave'),
    equippedProfileCard: pick('profile_card'),
    equippedDynamicProfile: pick('dynamic_profile'),
  };
}

/**
 * Prisma select for user summaries rendered in room seats, chat messages,
 * DMs, rankings, etc. Includes currently equipped (non-expired) cosmetics
 * via the UserStoreItem join + the activeSpecialId from the User model.
 *
 * Call as a function so the `expiresAt > now()` filter evaluates per-query.
 */
export function userSummarySelect() {
  return {
    id: true,
    profileHidden: true,
    username: true,
    displayName: true,
    avatar: true,
    hakaId: true,
    activeSpecialId: true,
    activeSpecialIdLevel: true,
    activeSpecialIdExpiresAt: true,
    level: { select: { richLevel: true, charmLevel: true } },
    storeItems: {
      where: equippedStoreItemsWhere(),
      select: {
        item: { select: STORE_ITEM_ITEM_SELECT },
      },
    },
  } satisfies Prisma.UserSelect;
}

type RawUserSummary = {
  id: string;
  profileHidden?: boolean;
  username: string | null;
  displayName: string;
  avatar: string;
  hakaId: string | null;
  /** When present on the raw row (e.g. room list), exposed for location/regional UI */
  country?: string;
  city?: string;
  activeSpecialId: string | null;
  activeSpecialIdLevel: string | null;
  activeSpecialIdExpiresAt: Date | null;
  level: { richLevel: number; charmLevel: number } | null;
  storeItems: RawStoreItemRow[];
};

export function serializeUserSummary(user: RawUserSummary): UserSummary {
  const cosmetics = parseEquippedCosmetics(user.storeItems);

  // Check if the special ID is still valid (not expired)
  const now = new Date();
  const specialIdValid = user.activeSpecialId &&
    (!user.activeSpecialIdExpiresAt || user.activeSpecialIdExpiresAt > now);

  const activeSpecialId = specialIdValid ? user.activeSpecialId : null;
  const displayHakaId = activeSpecialId ?? user.hakaId;

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar,
    hakaId: displayHakaId,
    originalHakaId: user.hakaId,
    activeSpecialId,
    activeSpecialIdLevel: activeSpecialId ? user.activeSpecialIdLevel : null,
    ...cosmetics,
    richLevel: user.level?.richLevel ?? 1,
    charmLevel: user.level?.charmLevel ?? 1,
    ...(user.country !== undefined && user.country !== '' ? { country: user.country } : {}),
    ...(user.city !== undefined && user.city !== '' ? { city: user.city } : {}),
    ...(user.profileHidden === true ? { profileHidden: true as const } : {}),
  };
}

/** Null cosmetic fields for anonymised / mystery viewer stubs. */
export function emptyEquippedCosmetics(): EquippedCosmetics {
  return {
    equippedFrame: null,
    equippedRing: null,
    equippedChatBubble: null,
    equippedMicVoiceWave: null,
    equippedProfileCard: null,
    equippedDynamicProfile: null,
  };
}
