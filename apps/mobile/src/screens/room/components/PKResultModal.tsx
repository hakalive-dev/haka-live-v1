import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Radius, Spacing } from '@/theme';
import type { PkResultState } from '@hooks/usePKBattle';

interface Props {
  result: PkResultState | null;
  hostAId: string;
  hostAName: string;
  hostBId: string;
  hostBName: string;
  onDismiss: () => void;
}

export function PKResultModal({ result, hostAId, hostAName, hostBId, hostBName, onDismiss }: Props) {
  if (!result) return null;

  const aWon = result.winnerId === hostAId;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.trophy}>🏆</Text>
          <Text style={styles.title}>PK Result</Text>

          <View style={styles.row}>
            <View style={[styles.side, aWon && styles.winnerSide]}>
              {aWon ? (
                <Text style={styles.badge}>WINNER</Text>
              ) : (
                <Text style={styles.loserBadge}>LOSER</Text>
              )}
              <Text style={styles.name}>{hostAName}</Text>
              <Text style={styles.score}>⭐ {result.scoreA.toLocaleString()}</Text>
            </View>
            <Text style={styles.vs}>VS</Text>
            <View style={[styles.side, !aWon && styles.winnerSide]}>
              {!aWon ? (
                <Text style={styles.badge}>WINNER</Text>
              ) : (
                <Text style={styles.loserBadge}>LOSER</Text>
              )}
              <Text style={styles.name}>{hostBName}</Text>
              <Text style={styles.score}>⭐ {result.scoreB.toLocaleString()}</Text>
            </View>
          </View>

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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    width: 320,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  trophy: { fontSize: 48, marginBottom: Spacing.xs },
  title: { color: Colors.textPrimary, fontSize: 22, fontWeight: '700', marginBottom: Spacing.lg },
  row: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center', marginBottom: Spacing.xl },
  vs: { color: Colors.textTertiary, fontSize: 14, fontWeight: '700' },
  side: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  winnerSide: { borderColor: Colors.gold, backgroundColor: Colors.goldSubtle },
  badge: { color: Colors.gold, fontSize: 10, fontWeight: '700', marginBottom: 4 },
  loserBadge: { color: Colors.danger, fontSize: 10, fontWeight: '700', marginBottom: 4 },
  name: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600', marginBottom: 2 },
  score: { color: Colors.textSecondary, fontSize: 11 },
  backBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: 12,
    paddingHorizontal: Spacing.xl,
    width: '100%',
    alignItems: 'center',
  },
  backText: { color: Colors.textInverse, fontSize: 15, fontWeight: '600' },
});
