import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text } from 'react-native';
import { Image } from 'expo-image';

import { Colors, Spacing } from '@/theme';

import { TOAST_HEIGHT } from './GiftToast';

/** Display size — downscaled from 1024×565 @3x art for a crisp render. */
const BANNER_WIDTH = 94;
const BANNER_HEIGHT = 52;
/** Vertically center the banner with the first gift-toast row. */
const ROW_TOP = (TOAST_HEIGHT - BANNER_HEIGHT) / 2;
/** Flat ribbon band — coin row sits on the lower red banner (~22% from bottom). */
const RIBBON_BOTTOM_OFFSET = BANNER_HEIGHT * 0.22;
const DEFAULT_HOLD_MS = 2400;
const FLY_IN_MS = 480;
const ENTER_OFFSET_Y = -48;
const EXIT_OFFSET_Y = -16;
const EXIT_MS = 300;

const LUCKY_WIN_BANNER = require('../../../assets/lucky-gifts/lucky_win_banner.png');
const COIN_ICON = require('../../../assets/coin.png');

export interface LuckyWinPopupItem {
  id: string;
  rewardCoins: number;
  /** Changes on each new win to reset the hold timer and replay enter pulse. */
  bump: number;
}

interface Props {
  item: LuckyWinPopupItem | null;
  onDismiss: () => void;
  holdDurationMs?: number;
}

export const LuckyWinPopup = React.memo(LuckyWinPopupInner);

function LuckyWinPopupInner({
  item,
  onDismiss,
  holdDurationMs = DEFAULT_HOLD_MS,
}: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(ENTER_OFFSET_Y)).current;
  const amountScale = useRef(new Animated.Value(1)).current;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!item) return;
    opacity.setValue(0);
    translateY.setValue(ENTER_OFFSET_Y);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: FLY_IN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [item?.id, item?.bump, opacity, translateY]);

  useEffect(() => {
    if (!item) return;
    amountScale.setValue(1.35);
    Animated.spring(amountScale, {
      toValue: 1,
      friction: 4,
      tension: 200,
      useNativeDriver: true,
    }).start();
  }, [item?.bump, amountScale]);

  useEffect(() => {
    if (!item) return;
    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      onDismissRef.current();
    };

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 280,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: EXIT_OFFSET_Y,
          duration: EXIT_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => dismiss());
      // Fallback if the exit animation is interrupted.
      setTimeout(dismiss, EXIT_MS + 80);
    }, holdDurationMs);

    return () => {
      clearTimeout(timer);
    };
  }, [item?.id, item?.bump, holdDurationMs, opacity, translateY]);

  if (!item) return null;

  const formatted =
    item.rewardCoins >= 1000
      ? item.rewardCoins.toLocaleString()
      : String(item.rewardCoins);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.root,
        { top: ROW_TOP, opacity, transform: [{ translateY }] },
      ]}
    >
      <Image
        source={LUCKY_WIN_BANNER}
        style={styles.banner}
        contentFit="contain"
        priority="high"
        allowDownscaling
        transition={0}
      />
      <Animated.View
        style={[styles.amountRow, { transform: [{ scale: amountScale }] }]}
      >
        <Image
          source={COIN_ICON}
          style={styles.coinIcon}
          contentFit="contain"
          priority="high"
          allowDownscaling
          transition={0}
        />
        <Text allowFontScaling={false} style={styles.amount}>
          {formatted}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    right: Spacing.sm,
    width: BANNER_WIDTH,
    height: BANNER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 10000,
    elevation: 31,
  },
  banner: {
    ...StyleSheet.absoluteFillObject,
    width: BANNER_WIDTH,
    height: BANNER_HEIGHT,
  },
  amountRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: RIBBON_BOTTOM_OFFSET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 15,
  },
  coinIcon: {
    width: 9,
    height: 9,
  },
  amount: {
    color: Colors.goldLight,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(80,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
