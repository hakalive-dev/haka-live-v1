import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { Radius } from '@/theme';

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

const TOAST_HEIGHT = 56;
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

  // Enter animation — runs once on mount.
  useEffect(() => {
    Animated.parallel([
      Animated.timing(tx, { toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [tx, opacity]);

  // Hold + exit — resets every time `bump` changes (a new combo lands).
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

  // Bounce the combo badge on each bump.
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
      <View style={styles.avatar}>
        {item.senderAvatar ? (
          <Image source={{ uri: item.senderAvatar }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#7B4FFF' }]} />
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
            <Ionicons name="gift" size={26} color="#FFD84D" />
          </View>
        )}
        <Animated.Text style={[styles.qty, { transform: [{ scale: comboScale }] }]}>
          ×{item.qty}
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: {
    position: 'absolute',
    left: 8,
    right: 0,
    zIndex: 999999,
    elevation: 999999,
  },
  toast: {
    position: 'absolute',
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    height: TOAST_HEIGHT,
    paddingHorizontal: 8,
    paddingRight: 16,
    backgroundColor: 'rgba(60,32,90,0.78)',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    maxWidth: 320,
    minWidth: 240,
    gap: 10,
  },
  avatar: {
    width: 40, height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    // Gift overlay: show plain avatar (no frame/ring)
    borderWidth: 0,
    borderColor: 'transparent',
  },
  textCol: { flex: 1 },
  sender: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  recipient: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '500', marginTop: 1 },
  giftCol: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  giftImg: { width: 32, height: 32 },
  giftIconFallback: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  qty: { color: '#FFD84D', fontSize: 18, fontWeight: '800', fontStyle: 'italic' },
});
