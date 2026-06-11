import type { EquippedCosmetic, RoomUser, User, UserEquippedCosmetics } from '@/types';

export function isSvgaAssetUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return /\.svga$/i.test(new URL(url).pathname);
  } catch {
    return /\.svga(\?|$)/i.test(url);
  }
}

function resolveEquippedBubble(
  sender: (UserEquippedCosmetics & { id?: string }) | null | undefined,
  fallbackUser?: (UserEquippedCosmetics & { id?: string }) | null,
): EquippedCosmetic | null | undefined {
  const senderBubble = sender?.equippedChatBubble ?? null;
  const fallbackBubble =
    sender?.id && fallbackUser?.id === sender.id
      ? fallbackUser.equippedChatBubble ?? null
      : null;

  if (!senderBubble) return fallbackBubble;
  if (!fallbackBubble) return senderBubble;

  if (
    sender.id &&
    fallbackUser?.id === sender.id &&
    !senderBubble.previewImage &&
    fallbackBubble.previewImage
  ) {
    return { ...senderBubble, previewImage: fallbackBubble.previewImage };
  }

  return senderBubble;
}

/** @deprecated Prefer getChatBubbleVisualSources for room chat rendering. */
export function getEquippedChatBubbleImage(
  sender: UserEquippedCosmetics | null | undefined,
  fallbackUser?: UserEquippedCosmetics | null,
): string | null {
  const bubble = resolveEquippedBubble(sender, fallbackUser);
  return bubble?.previewImage ?? bubble?.image ?? null;
}

export interface ChatBubbleVisualSources {
  fill: string | null;
  animation: string | null;
  /** Low-res placeholder shown only while SVGA loads — not a permanent underlay. */
  fallback: string | null;
}

/**
 * Chat bubbles are uploaded as PNG frame + optional SVGA animation.
 * SVGA is the primary HD visual; PNG is used for static-only items or as a load fallback.
 */
export function getChatBubbleVisualSources(
  sender: UserEquippedCosmetics | null | undefined,
  fallbackUser?: UserEquippedCosmetics | null,
): ChatBubbleVisualSources {
  const bubble = resolveEquippedBubble(sender, fallbackUser);
  if (!bubble) return { fill: null, animation: null, fallback: null };

  const image = bubble.image ?? null;
  const preview = bubble.previewImage ?? null;
  const animation = isSvgaAssetUrl(image) ? image : null;
  const staticImage =
    (image && !isSvgaAssetUrl(image) ? image : null) ?? preview ?? null;

  if (animation) {
    return {
      fill: null,
      animation,
      fallback: staticImage,
    };
  }

  return {
    fill: staticImage,
    animation: null,
    fallback: null,
  };
}

export function hasEquippedChatBubble(
  sender: UserEquippedCosmetics | null | undefined,
  fallbackUser?: UserEquippedCosmetics | null,
): boolean {
  const bubble = resolveEquippedBubble(sender, fallbackUser);
  return !!(bubble?.previewImage || bubble?.image);
}

/** Merge known equipped cosmetics onto a chat sender (e.g. current auth user). */
export function enrichRoomChatSender(
  sender: RoomUser | null | undefined,
  knownUser: (UserEquippedCosmetics & { id: string }) | null | undefined,
): RoomUser | null | undefined {
  if (!sender || !knownUser || sender.id !== knownUser.id) return sender;
  const current = sender.equippedChatBubble;
  if (current?.image || current?.previewImage) return sender;
  if (!knownUser.equippedChatBubble) return sender;
  return { ...sender, equippedChatBubble: knownUser.equippedChatBubble };
}

export function enrichRoomChatMessage(
  message: { sender: RoomUser } & Record<string, unknown>,
  knownUser: User | null | undefined,
) {
  const sender = enrichRoomChatSender(message.sender, knownUser);
  if (sender === message.sender) return message;
  return { ...message, sender: sender ?? message.sender };
}

/** Patch the current user's bubble on messages already in the list. */
export function patchOwnRoomChatBubble<T extends { sender: RoomUser; type?: string }>(
  messages: T[],
  userId: string,
  bubble: UserEquippedCosmetics['equippedChatBubble'],
): T[] {
  let changed = false;
  const next = messages.map((message) => {
    if (message.sender?.id !== userId) return message;
    if (
      message.type === 'gift_notice' ||
      message.type === 'lucky_win_notice' ||
      message.type === 'system'
    ) {
      return message;
    }
    if (message.sender.equippedChatBubble?.id === bubble?.id) return message;
    changed = true;
    return {
      ...message,
      sender: { ...message.sender, equippedChatBubble: bubble ?? null },
    };
  });
  return changed ? next : messages;
}
