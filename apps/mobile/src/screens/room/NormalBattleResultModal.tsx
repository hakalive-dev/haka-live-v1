import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Radius, Spacing } from '@/theme';
import type { BattleResult } from '@hooks/useNormalBattle';

interface Props {
  result: BattleResult | null;
  participantAId: string;
  participantBId: string;
  onDismiss: () => void;
}

export function NormalBattleResultModal({ result, participantAId, participantBId, onDismiss }: Props) {
  if (!result) return null;

  const isTie = result.winnerId === null;
  const aWon = result.winnerId === participantAId;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.trophy}>{isTie ? '🤝' : '🏆'}</Text>
          <Text style={styles.title}>Battle Result</Text>

          <View style={styles.row}>
            <View style={[styles.side, !isTie && aWon && styles.winnerSide]}>
              {!isTie && (aWon ? (
                <Text style={styles.badge}>WINNER</Text>
              ) : (
                <Text style={styles.loserBadge}>LOSER</Text>
              ))}
              <Text style={styles.name}>Player A</Text>
              <Text style={styles.score}>⭐ {result.scoreA.toLocaleString()}</Text>
            </View>
            <Text style={styles.vs}>VS</Text>
            <View style={[styles.side, !isTie && !aWon && styles.winnerSide]}>
              {!isTie && (!aWon ? (
                <Text style={styles.badge}>WINNER</Text>
              ) : (
                <Text style={styles.loserBadge}>LOSER</Text>
              ))}
              <Text style={styles.name}>Player B</Text>
              <Text style={styles.score}>⭐ {result.scoreB.toLocaleString()}</Text>
            </View>
          </View>

          {isTie && <Text style={styles.tieText}>It's a Tie!</Text>}

          <TouchableOpacity style={styles.backBtn} onPress={onDismiss} activeOpacity={0.8}>
            <Text style={styles.backText}>Back to Room</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    width: '80%',
    alignItems: 'center',
  },
  trophy: {
    fontSize: 48,
    marginBottom: Spacing.sm,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  side: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  winnerSide: {
    borderColor: Colors.gold,
    backgroundColor: Colors.goldSubtle,
  },
  badge: {
    color: Colors.gold,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  loserBadge: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  name: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  score: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  vs: {
    color: Colors.textTertiary,
    fontSize: 14,
    fontWeight: '700',
  },
  tieText: {
    color: Colors.gold,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  backBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
  },
  backText: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
});
