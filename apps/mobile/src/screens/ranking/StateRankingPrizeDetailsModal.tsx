import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DEFAULT_STATE_RANK_REWARD_TIERS } from '@haka-live/shared-types/state-rankings';
import { Colors, Spacing, Radius } from '@/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function StateRankingPrizeDetailsModal({ visible, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>Prize Details</Text>
          <Text style={styles.subtitle}>
            Daily pool by state rank. Top 4 hosts in each state split 65% / 20% / 10% / 5%.
          </Text>
          <ScrollView style={styles.table}>
            <View style={[styles.row, styles.headerRow]}>
              <Text style={[styles.cell, styles.headerCell, styles.rankCol]}>State rank</Text>
              <Text style={[styles.cell, styles.headerCell, styles.poolCol]}>Daily pool (beans)</Text>
            </View>
            {DEFAULT_STATE_RANK_REWARD_TIERS.map((tier) => (
              <View key={tier.stateRankMin} style={styles.row}>
                <Text style={[styles.cell, styles.rankCol]}>
                  {tier.stateRankMax === tier.stateRankMin
                    ? tier.stateRankMin
                    : tier.stateRankMax >= 999
                      ? `${tier.stateRankMin}+`
                      : `${tier.stateRankMin}–${tier.stateRankMax}`}
                </Text>
                <Text style={[styles.cell, styles.poolCol]}>{tier.poolTotal.toLocaleString()}</Text>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color={Colors.textPrimary} />
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: Spacing.md,
  },
  title: { color: Colors.textPrimary, fontSize: 20, fontWeight: '700', marginBottom: Spacing.xs },
  subtitle: { color: Colors.textSecondary, fontSize: 13, marginBottom: Spacing.lg },
  table: { marginBottom: Spacing.md },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: Spacing.sm,
  },
  headerRow: { backgroundColor: Colors.surfaceHighlight },
  cell: { color: Colors.textPrimary, fontSize: 14 },
  headerCell: { fontWeight: '700' },
  rankCol: { flex: 1 },
  poolCol: { flex: 1, textAlign: 'right' },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  closeText: { color: Colors.textPrimary, fontWeight: '600' },
});
