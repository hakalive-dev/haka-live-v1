import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '@/theme';

interface Props {
  /** Combo count; badge hides when count <= 1 or null. */
  count: number | null;
  senderName?: string;
  giftIcon?: string;
}

export function ComboBadge({ count, senderName, giftIcon }: Props) {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (count && count > 1) {
      scale.stopAnimation();
      scale.setValue(0.6);
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 180,
        friction: 6,
      }).start();
    } else {
      Animated.timing(scale, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [count, scale]);

  if (!count || count <= 1) return null;

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Animated.View style={[styles.pill, { transform: [{ scale }] }]}>
        {giftIcon ? (
          <Text style={styles.icon}>{giftIcon}</Text>
        ) : (
          <Ionicons name="gift" size={22} color={Colors.gold} />
        )}
        <View>
          {senderName ? <Text style={styles.sender} numberOfLines={1}>{senderName}</Text> : null}
          <Text style={styles.combo}>
            COMBO <Text style={styles.comboNum}>×{count}</Text>
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    top: 140,
    zIndex: 50,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: Colors.gold,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 6,
  },
  icon: { fontSize: 22 },
  sender: {
    color: Colors.textInverse,
    fontSize: 11,
    fontWeight: '600',
    maxWidth: 120,
  },
  combo: {
    color: Colors.textInverse,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  comboNum: {
    color: Colors.gold,
    fontSize: 16,
    fontWeight: '800',
  },
});
