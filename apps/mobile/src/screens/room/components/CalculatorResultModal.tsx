import React from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Colors, Radius, Spacing } from '@/theme';
import type { CalcScoreEntry } from '@/api/rooms';

interface Props {
  visible: boolean;
  scores: CalcScoreEntry[];
  onDismiss: () => void;
}

function formatPoints(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function PodiumAvatar({
  entry,
  rank,
  size,
}: {
  entry: CalcScoreEntry;
  rank: 1 | 2 | 3;
  size: number;
}) {
  const borderColor = rank === 1 ? Colors.gold : rank === 2 ? '#C0C0C0' : '#CD7F32';
  return (
    <View style={[styles.podiumItem, rank === 1 && styles.podiumFirst]}>
      {rank === 1 && <Ionicons name="trophy" size={20} color={Colors.gold} style={styles.crownIcon} />}
      <View style={[styles.podiumAvatar, { width: size, height: size, borderRadius: size / 2, borderColor }]}>
        {entry.user.avatar ? (
          <Image source={{ uri: entry.user.avatar }} style={{ width: size - 4, height: size - 4, borderRadius: (size - 4) / 2 }} />
        ) : (
          <View style={[styles.avatarFallback, { width: size - 4, height: size - 4, borderRadius: (size - 4) / 2 }]}>
            <Text style={styles.avatarFallbackText}>{entry.user.displayName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </View>
      <Text style={styles.podiumName} numberOfLines={1}>{entry.user.displayName}</Text>
      <Text style={styles.podiumPoints}>🔥 {formatPoints(entry.points)}</Text>
    </View>
  );
}

export function CalculatorResultModal({ visible, scores, onDismiss }: Props) {
  const top3 = scores.slice(0, 3);
  const rest = scores.slice(3);

  const podiumOrder: (CalcScoreEntry | undefined)[] = [
    top3[1], // 2nd place — left
    top3[0], // 1st place — center
    top3[2], // 3rd place — right
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>Calculator Results</Text>

          {scores.length === 0 ? (
            <Text style={styles.empty}>No scores recorded.</Text>
          ) : (
            <>
              <View style={styles.podiumRow}>
                {podiumOrder.map((entry, i) =>
                  entry ? (
                    <PodiumAvatar
                      key={entry.userId}
                      entry={entry}
                      rank={([2, 1, 3] as const)[i]}
                      size={i === 1 ? 64 : 52}
                    />
                  ) : (
                    <View key={i} style={styles.podiumPlaceholder} />
                  ),
                )}
              </View>

              {rest.length > 0 && (
                <FlatList
                  data={rest}
                  keyExtractor={(item) => item.userId}
                  style={styles.list}
                  renderItem={({ item, index }) => (
                    <View style={styles.listRow}>
                      <Text style={styles.listRank}>#{index + 4}</Text>
                      <Text style={styles.listName} numberOfLines={1}>{item.user.displayName}</Text>
                      <Text style={styles.listPoints}>🔥 {formatPoints(item.points)}</Text>
                    </View>
                  )}
                />
              )}
            </>
          )}

          <TouchableOpacity style={styles.okBtn} onPress={onDismiss}>
            <Text style={styles.okBtnText}>OK</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    backgroundColor: 'transparent',
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0B0B14',
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  empty: {
    color: '#55556A',
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  podiumRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  podiumItem: {
    alignItems: 'center',
    width: 80,
  },
  podiumFirst: {
    marginBottom: 12,
  },
  crownIcon: {
    marginBottom: 2,
  },
  podiumAvatar: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 4,
  },
  avatarFallback: {
    backgroundColor: Colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: Colors.primaryLight,
    fontWeight: '700',
    fontSize: 18,
  },
  podiumName: {
    color: '#0B0B14',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  podiumPoints: {
    color: Colors.gold,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  podiumPlaceholder: {
    width: 80,
  },
  list: {
    maxHeight: 160,
    marginBottom: Spacing.lg,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E5',
  },
  listRank: {
    color: '#55556A',
    fontSize: 12,
    width: 32,
  },
  listName: {
    flex: 1,
    color: '#0B0B14',
    fontSize: 13,
  },
  listPoints: {
    color: Colors.gold,
    fontSize: 13,
    fontWeight: '600',
  },
  okBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  okBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
