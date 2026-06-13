import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors } from '@/theme';

/** Left-to-right: dark black behind avatar → fully transparent on the right. */
const PILL_GRADIENT = ['rgba(0,0,0,0.72)', 'rgba(0,0,0,0.32)', 'transparent'] as const;
const PILL_GRADIENT_LOCATIONS = [0, 0.5, 1] as const;

export interface GiftToastItem {
  id: string;
  comboKey: string;
  senderName: string;
  senderAvatar: string | null;
  recipientName: string;
  giftIcon: string;
  giftImage: string | null;
  qty: number;
  /** Bump counter — increments each time the same combo is sent again. Resets the hold timer. */
  bump: number;
  /** Consecutive send count for the same sender+gift combo (server comboCount, or client-side tally). */
  combo: number;
}

interface Props {
  items: GiftToastItem[];
  onDismiss: (id: string) => void;
  holdDurationMs?: number;
}

const AVATAR_SIZE = 32;
const BAR_HEIGHT = 40;
/** Pill row height — used for stack spacing + lucky-banner alignment. */
export const TOAST_HEIGHT = BAR_HEIGHT;
const GAP = 8;
const DEFAULT_HOLD_DURATION_MS = 2400;

export const GiftToastStack = React.memo(GiftToastStackInner);
function GiftToastStackInner({
  items,
  onDismiss,
  holdDurationMs = DEFAULT_HOLD_DURATION_MS,
}: Props) {
  return (
    <View pointerEvents="none" style={styles.stack}>
      {items.map((it, i) => (
        <GiftToast
          key={it.id}
          item={it}
          index={i}
          holdDurationMs={holdDurationMs}
          onDismiss={onDismiss}
        />
      ))}
    </View>
  );
}

function GiftToast({
  item,
  index,
  holdDurationMs,
  onDismiss,
}: {
  item: GiftToastItem;
  index: number;
  holdDurationMs: number;
  onDismiss: (id: string) => void;
}) {
  const tx = useRef(new Animated.Value(320)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const comboScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(tx, { toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [tx, opacity]);

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(tx, { toValue: -360, duration: 280, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 240, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) onDismiss(item.id);
      });
    }, holdDurationMs);
    return () => clearTimeout(timer);
  }, [item.id, item.bump, holdDurationMs, tx, opacity, onDismiss]);

  useEffect(() => {
    if (item.bump === 0) return;
    comboScale.setValue(0.6);
    Animated.spring(comboScale, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
  }, [item.bump, comboScale]);

  return (
    <Animated.View
      style={[
        styles.toast,
        { top: index * (TOAST_HEIGHT + GAP), opacity, transform: [{ translateX: tx }] },
      ]}
    >
      <LinearGradient
        colors={[...PILL_GRADIENT]}
        locations={[...PILL_GRADIENT_LOCATIONS]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.pill}
      >
        <View style={styles.avatar}>
          {item.senderAvatar ? (
            <Image source={{ uri: item.senderAvatar }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.avatarFallback]} />
          )}
        </View>
        <View style={styles.textCol}>
          <Text style={styles.sender} numberOfLines={1}>{item.senderName}</Text>
          <Text style={styles.recipient} numberOfLines={1}>Send to {item.recipientName}</Text>
        </View>
        <View style={styles.giftCol}>
          {item.giftImage ? (
            <Image source={{ uri: item.giftImage }} style={styles.giftImg} contentFit="contain" />
          ) : (
            <View style={styles.giftIconFallback}>
              <Ionicons name="gift" size={22} color={Colors.goldLight} />
            </View>
          )}
          <Animated.Text style={[styles.qty, { transform: [{ scale: comboScale }] }]}>
            x{item.qty}
          </Animated.Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: {
    position: 'absolute',
    top: 0,
    left: 8,
    right: 0,
    zIndex: 999999,
    elevation: 999999,
  },
  toast: {
    position: 'absolute',
    left: 0,
    height: TOAST_HEIGHT,
    maxWidth: 320,
    minWidth: 220,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: BAR_HEIGHT,
    paddingLeft: 4,
    paddingRight: 12,
    borderRadius: BAR_HEIGHT / 2,
    overflow: 'hidden',
    gap: 8,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarFallback: {
    backgroundColor: Colors.primary,
  },
  textCol: {
    flex: 1,
    justifyContent: 'center',
  },
  sender: {
    color: Colors.textInverse,
    fontSize: 13,
    fontWeight: '700',
  },
  recipient: {
    color: Colors.textInverse,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  giftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  giftImg: {
    width: 28,
    height: 28,
  },
  giftIconFallback: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qty: {
    color: Colors.textInverse,
    fontSize: 16,
    fontWeight: '800',
    fontStyle: 'italic',
  },
});
