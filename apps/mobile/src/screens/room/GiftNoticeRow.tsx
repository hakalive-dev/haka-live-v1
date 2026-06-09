import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';

import { GiftInlineIcon } from '@components/gifts/GiftInlineIcon';
import { UserAvatar } from '@components/UserAvatar';
import { RICH } from '@screens/level/LevelScreen';
import { Colors, Spacing } from '@/theme';
import type { RoomUser } from '@/types';

type Props = {
  sender: RoomUser;
  giftName: string;
  giftIcon: string;
  giftImageFallback?: string | null;
  recipientName: string;
  qty: number;
  onPressSender?: () => void;
};

export const GiftNoticeRow = React.memo(GiftNoticeRowInner);
function GiftNoticeRowInner({
  sender,
  giftName,
  giftIcon,
  giftImageFallback,
  recipientName,
  qty,
  onPressSender,
}: Props) {
  const name = sender.displayName ?? 'User';
  const richLevel = sender.richLevel ?? 0;

  return (
    <View style={styles.row}>
      <TouchableOpacity activeOpacity={0.7} onPress={onPressSender} disabled={!onPressSender}>
        <UserAvatar
          user={{
            displayName: name,
            avatar: sender.avatar ?? null,
            equippedFrame: sender.equippedFrame ?? null,
          }}
          size={28}
          hideFrame
        />
      </TouchableOpacity>
      <View style={styles.body}>
        <TouchableOpacity
          style={styles.nameRow}
          activeOpacity={0.7}
          onPress={onPressSender}
          disabled={!onPressSender}
        >
          <Text style={styles.senderName} numberOfLines={1}>
            {name}
          </Text>
          {richLevel > 0 ? (
            <View style={styles.levelBadge}>
              <Image
                source={RICH[Math.min(Math.max(richLevel, 1), 100)] ?? RICH[1]}
                style={styles.levelIcon}
                contentFit="contain"
              />
            </View>
          ) : null}
        </TouchableOpacity>
        <View style={styles.actionRow}>
          <Text style={styles.actionText} numberOfLines={2}>
            Send {giftName} {recipientName}
          </Text>
          <GiftInlineIcon giftIcon={giftIcon} giftImage={giftImageFallback} size={28} />
          <Text style={styles.multiplier}>x {qty}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: 2,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.textInverse,
    flexShrink: 1,
  },
  levelBadge: {
    flexShrink: 0,
  },
  levelIcon: {
    width: 36,
    height: 16,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textInverse,
    flexShrink: 1,
  },
  multiplier: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textInverse,
  },
});
