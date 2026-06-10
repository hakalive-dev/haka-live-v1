import React from 'react';
import {
  ImageSourcePropType,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { UserAvatar, type AvatarUser } from '@components/UserAvatar';
import { Colors, Radius, Spacing } from '@/theme';

const AVATAR_SIZE = 28;
/** Default cap for DM bubble width as a fraction of the message list content area. */
export const DM_BUBBLE_MAX_WIDTH_RATIO = 0.72;
/** Horizontal inset of DM message lists (must match list `paddingHorizontal`). */
export const DM_LIST_HORIZONTAL_PADDING = Spacing.lg;

export function useDmBubbleMaxWidth(ratio = DM_BUBBLE_MAX_WIDTH_RATIO): number {
  const { width: windowWidth } = useWindowDimensions();
  const contentWidth = windowWidth - DM_LIST_HORIZONTAL_PADDING * 2;
  return Math.floor(contentWidth * ratio);
}

export type { AvatarUser };

type Props = {
  isMine: boolean;
  mineUser: AvatarUser;
  theirsUser: AvatarUser;
  isRead?: boolean;
  showReadReceipt?: boolean;
  peerLocalAvatar?: ImageSourcePropType;
  /** Align peer avatar to top of bubble (e.g. tall Withdrawal Message cards). */
  avatarAtTop?: boolean;
  /** Override default {@link DM_BUBBLE_MAX_WIDTH_RATIO} for wide cards (agency, withdrawal). */
  maxWidthRatio?: number;
  onBubbleLongPress?: () => void;
  children: React.ReactNode;
};

export function DmMessageRow({
  isMine,
  mineUser,
  theirsUser,
  isRead = false,
  showReadReceipt = true,
  peerLocalAvatar,
  avatarAtTop = false,
  maxWidthRatio,
  onBubbleLongPress,
  children,
}: Props) {
  const bubbleMaxWidth = useDmBubbleMaxWidth(maxWidthRatio ?? DM_BUBBLE_MAX_WIDTH_RATIO);
  const avatarUser = isMine ? mineUser : theirsUser;
  const messageAvatar = (
    <View style={[styles.messageAvatar, avatarAtTop && styles.messageAvatarTop]}>
      <UserAvatar
        user={avatarUser}
        localAvatar={!isMine ? peerLocalAvatar : undefined}
        hideFrame
        hideBorder
        size={AVATAR_SIZE}
      />
    </View>
  );

  const bubbleBody = onBubbleLongPress ? (
    <Pressable onLongPress={onBubbleLongPress} delayLongPress={300}>
      {children}
    </Pressable>
  ) : (
    children
  );

  // Width cap lives on this full-width row child so maxWidth is not measured against
  // Pressable (which has no intrinsic width and caused single-character text wraps).
  const bubble = (
    <View style={[styles.bubbleSlot, { maxWidth: bubbleMaxWidth }]}>{bubbleBody}</View>
  );

  return (
    <View>
      <View
        style={[
          styles.bubbleRow,
          isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs,
          !isMine && avatarAtTop && styles.bubbleRowAvatarTop,
        ]}
      >
        {!isMine ? messageAvatar : null}
        {isMine && showReadReceipt ? (
          <Ionicons
            name={isRead ? 'checkmark-done' : 'checkmark'}
            size={14}
            color={isRead ? Colors.info : Colors.textTertiary}
            style={styles.readCheckIcon}
          />
        ) : null}
        {bubble}
        {isMine ? messageAvatar : null}
      </View>
      {isMine && isRead && showReadReceipt ? (
        <Text style={styles.readLabel}>Read</Text>
      ) : null}
    </View>
  );
}

export const dmMessageBubbleStyles = StyleSheet.create({
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 0,
  },
  bubbleRowMine: {
    justifyContent: 'flex-end',
  },
  bubbleRowTheirs: {
    justifyContent: 'flex-start',
  },
  messageAvatar: {
    marginHorizontal: Spacing.xs,
    alignSelf: 'flex-end',
  },
  messageAvatarTop: {
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
  },
  bubbleRowAvatarTop: {
    alignItems: 'flex-start',
  },
  bubbleSlot: {
    flexShrink: 1,
    minWidth: 0,
  },
  bubble: {
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  bubbleMine: {
    backgroundColor: Colors.success,
    borderBottomRightRadius: Radius.xs,
  },
  bubbleTheirs: {
    backgroundColor: Colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderBottomLeftRadius: Radius.xs,
  },
  bubbleText: {
    fontSize: 13,
    lineHeight: 18,
  },
  bubbleTextMine: {
    color: Colors.textInverse,
  },
  bubbleTextTheirs: {
    color: Colors.textPrimary,
  },
  readCheckIcon: {
    marginRight: Spacing.xs,
    marginBottom: 1,
  },
  readLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    textAlign: 'right',
    marginTop: 1,
    marginRight: 34,
  },
  listContent: {
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
});

const styles = dmMessageBubbleStyles;
