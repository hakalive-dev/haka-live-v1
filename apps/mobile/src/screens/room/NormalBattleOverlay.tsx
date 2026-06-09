import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Radius, Spacing } from '@/theme';
import type { BattleState } from '@hooks/useNormalBattle';

interface Props {
  battle: BattleState;
  myUserId: string;
  isHost: boolean;
  onVote: (battleId: string, voteFor: 'A' | 'B') => void;
  onCancel: (roomId: string) => void;
  roomId: string;
}

export function NormalBattleOverlay({ battle, myUserId, isHost, onVote, onCancel, roomId }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const progressAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, Math.floor((new Date(battle.endsAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [battle.endsAt]);

  useEffect(() => {
    const total = battle.scoreA + battle.scoreB;
    const ratio = total > 0 ? battle.scoreA / total : 0.5;
    Animated.timing(progressAnim, {
      toValue: ratio,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [battle.scoreA, battle.scoreB, progressAnim]);

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const secs = String(secondsLeft % 60).padStart(2, '0');

  const isParticipant =
    myUserId === battle.participantAId || myUserId === battle.participantBId;

  return (
    <View style={styles.container}>
      <View style={styles.timerBadge}>
        <Text style={styles.timerLabel}>⚔️ Battle</Text>
        <Text style={styles.timerText}>{mins}:{secs}</Text>
      </View>

      <View style={styles.hostsRow}>
        <View style={styles.side}>
          <Text style={styles.scoreText}>⭐ {battle.scoreA.toLocaleString()}</Text>
          <Text style={styles.sideLabel}>A</Text>
        </View>

        <View style={styles.progressWrap}>
          <Animated.View style={[styles.progressA, { flex: progressAnim as any }]} />
          <Animated.View
            style={[
              styles.progressB,
              { flex: Animated.subtract(1, progressAnim) as any },
            ]}
          />
        </View>

        <View style={[styles.side, styles.sideRight]}>
          <Text style={styles.scoreText}>⭐ {battle.scoreB.toLocaleString()}</Text>
          <Text style={styles.sideLabel}>B</Text>
        </View>
      </View>

      {battle.mode === 'votes' && !isParticipant && (
        <View style={styles.voteRow}>
          <TouchableOpacity
            style={[styles.voteBtn, styles.voteBtnA]}
            onPress={() => onVote(battle.battleId, 'A')}
            activeOpacity={0.8}
          >
            <Text style={styles.voteBtnText}>Vote A</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.voteBtn, styles.voteBtnB]}
            onPress={() => onVote(battle.battleId, 'B')}
            activeOpacity={0.8}
          >
            <Text style={styles.voteBtnText}>Vote B</Text>
          </TouchableOpacity>
        </View>
      )}

      {isHost && (
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => onCancel(roomId)}
          activeOpacity={0.8}
        >
          <Text style={styles.cancelBtnText}>Cancel Battle</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  timerLabel: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  timerText: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  hostsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  side: {
    flex: 1,
    alignItems: 'center',
  },
  sideRight: {
    alignItems: 'center',
  },
  sideLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  scoreText: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  progressWrap: {
    flex: 2,
    flexDirection: 'row',
    height: 8,
    borderRadius: Radius.xs,
    overflow: 'hidden',
    marginHorizontal: Spacing.sm,
  },
  progressA: {
    backgroundColor: Colors.primary,
  },
  progressB: {
    backgroundColor: Colors.danger,
  },
  voteRow: {
    flexDirection: 'row',
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  voteBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  voteBtnA: {
    backgroundColor: Colors.primary,
  },
  voteBtnB: {
    backgroundColor: Colors.danger,
  },
  voteBtnText: {
    color: Colors.textPrimary,
    fontWeight: '600',
    fontSize: 13,
  },
  cancelBtn: {
    marginTop: Spacing.sm,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
});
