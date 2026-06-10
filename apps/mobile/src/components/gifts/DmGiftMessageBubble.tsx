import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { GiftInlineIcon } from '@components/gifts/GiftInlineIcon';
import { Colors, Radius, Spacing } from '@/theme';

const ICON_SIZE = 32;
const FLOAT_OFFSET = 4;
const FLOAT_HALF_MS = 2000;
const PULSE_SCALE_MAX = 1.08;
const PULSE_HALF_MS = 1100;

type Props = {
  giftIcon?: string;
  giftImage?: string | null;
  giftName?: string;
  giftQty?: number;
  isMine?: boolean;
};

export function DmGiftMessageBubble({
  giftIcon = '',
  giftImage,
  giftName,
  giftQty = 1,
  isMine = true,
}: Props) {
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    translateY.value = 0;
    translateY.value = withRepeat(
      withTiming(-FLOAT_OFFSET, {
        duration: FLOAT_HALF_MS,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );

    scale.value = 1;
    scale.value = withRepeat(
      withTiming(PULSE_SCALE_MAX, {
        duration: PULSE_HALF_MS,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );

    return () => {
      cancelAnimation(translateY);
      cancelAnimation(scale);
    };
  }, [translateY, scale]);

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
      <Reanimated.View style={[styles.iconWrap, iconAnimatedStyle]}>
        <GiftInlineIcon
          giftIcon={giftIcon}
          giftImage={giftImage}
          size={ICON_SIZE}
          preferImage
        />
      </Reanimated.View>
      <Text style={[styles.label, isMine ? styles.labelMine : styles.labelTheirs]}>
        Sent {giftName || 'Gift'} x{giftQty}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
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
  iconWrap: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  labelMine: {
    color: Colors.textInverse,
  },
  labelTheirs: {
    color: Colors.textPrimary,
  },
});
