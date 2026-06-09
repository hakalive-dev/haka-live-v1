import React from 'react';
import { ImageSourcePropType, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { UserAvatar, type AvatarUser } from '@components/UserAvatar';
import { Colors, Radius, Spacing } from '@/theme';

const AVATAR_SIZE = 28;

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
  onBubbleLongPress,
  children,
}: Props) {
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

  const bubble = onBubbleLongPress ? (
    <Pressable onLongPress={onBubbleLongPress} delayLongPress={300}>
      {children}
    </Pressable>
  ) : (
    children
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
  bubble: {
    maxWidth: '72%',
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
