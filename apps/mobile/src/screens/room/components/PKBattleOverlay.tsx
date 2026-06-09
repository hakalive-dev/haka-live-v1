import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Radius, Spacing } from '@/theme';
import type { PkMatchState } from '@hooks/usePKBattle';

interface Props {
  match: PkMatchState;
  myUserId: string;
  hostAAvatar: string | null;
  hostBAvatar: string | null;
  onForfeit: () => void;
}

export function PKBattleOverlay({ match, myUserId, hostAAvatar, hostBAvatar, onForfeit }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const progressAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, Math.floor((new Date(match.endsAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [match.endsAt]);

  useEffect(() => {
    const total = match.scoreA + match.scoreB;
    const ratio = total > 0 ? match.scoreA / total : 0.5;
    Animated.timing(progressAnim, {
      toValue: ratio,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [match.scoreA, match.scoreB, progressAnim]);

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const secs = String(secondsLeft % 60).padStart(2, '0');

  return (
    <View style={styles.container}>
      <View style={styles.timerBadge}>
        <Text style={styles.timerLabel}>⚔️ PK</Text>
        <Text style={styles.timerText}>{mins}:{secs}</Text>
      </View>

      <View style={styles.hostsRow}>
        <View style={styles.hostSide}>
          {hostAAvatar ? (
            <Image
              source={{ uri: hostAAvatar }}
              style={styles.avatar}
              contentFit="cover"
            />
          ) : (
            <View style={styles.avatar} />
          )}
          <Text style={styles.scoreText}>⭐ {match.scoreA.toLocaleString()}</Text>
        </View>

        <View style={styles.progressWrap}>
          <Animated.View style={[styles.progressA, { flex: progressAnim as any }]} />
          <Animated.View
            style={[
              styles.progressB,
              {
                flex: Animated.subtract(1, progressAnim) as any,
              },
            ]}
          />
        </View>

        <View style={[styles.hostSide, styles.hostSideRight]}>
          {hostBAvatar ? (
            <Image
              source={{ uri: hostBAvatar }}
              style={styles.avatar}
              contentFit="cover"
            />
          ) : (
            <View style={styles.avatar} />
          )}
          <Text style={styles.scoreText}>⭐ {match.scoreB.toLocaleString()}</Text>
        </View>
      </View>

      {(myUserId === match.hostAId || myUserId === match.hostBId) && (
        <TouchableOpacity style={styles.forfeitBtn} onPress={onForfeit} activeOpacity={0.8}>
          <Text style={styles.forfeitText}>Give up</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  timerLabel: {
    color: Colors.primaryLight,
    fontSize: 12,
    fontWeight: '700',
  },
  timerText: {
    color: Colors.textInverse,
    fontSize: 14,
    fontWeight: '700',
  },
  hostsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  hostSide: {
    alignItems: 'center',
    width: 64,
  },
  hostSideRight: {
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: Colors.gold,
    marginBottom: 2,
  },
  scoreText: {
    color: Colors.gold,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  progressWrap: {
    flex: 1,
    height: 8,
    borderRadius: Radius.xs,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: Colors.surfaceHighlight,
  },
  progressA: {
    backgroundColor: '#FF4444',
    height: '100%',
  },
  progressB: {
    backgroundColor: '#4444FF',
    height: '100%',
  },
  forfeitBtn: {
    alignSelf: 'center',
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  forfeitText: {
    color: Colors.danger,
    fontSize: 11,
    fontWeight: '600',
  },
});
