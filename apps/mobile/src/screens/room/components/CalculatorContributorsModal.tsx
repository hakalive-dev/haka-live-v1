import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { roomsApi, type CalcContributorEntry } from '@api/rooms';
import { Colors, Radius, Spacing } from '@/theme';

interface Props {
  visible: boolean;
  roomId: string;
  recipientUserId?: string | null;
  onDismiss: () => void;
}

function formatPoints(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function ContributorRow({ entry, rank }: { entry: CalcContributorEntry; rank: number }) {
  const rankColor = rank === 1 ? Colors.gold : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : Colors.textSecondary;
  return (
    <View style={styles.row}>
      <Text style={[styles.rank, { color: rankColor }]}>#{rank}</Text>
      <View style={styles.avatarWrap}>
        {entry.user.avatar ? (
          <Image source={{ uri: entry.user.avatar }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>{entry.user.displayName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.name} numberOfLines={1}>{entry.user.displayName}</Text>
        {entry.user.hakaId ? (
          <Text style={styles.hakaId} numberOfLines={1}>{entry.user.hakaId}</Text>
        ) : null}
      </View>
      <View style={styles.pointsBadge}>
        <Ionicons name="flame" size={13} color={Colors.gold} />
        <Text style={styles.pointsText}>{formatPoints(entry.points)}</Text>
      </View>
    </View>
  );
}

export function CalculatorContributorsModal({
  visible,
  roomId,
  recipientUserId,
  onDismiss,
}: Props) {
  const insets = useSafeAreaInsets();
  const [contributors, setContributors] = useState<CalcContributorEntry[]>([]);
  const [totalReceiving, setTotalReceiving] = useState<number | null>(null);
  const [recipientName, setRecipientName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    if (recipientUserId) {
      roomsApi
        .getCalculatorRecipientContributors(roomId, recipientUserId)
        .then((data) => {
          setContributors(data.contributors);
          setTotalReceiving(data.totalReceiving);
          setRecipientName(data.recipient?.displayName ?? null);
        })
        .catch(() => {
          setContributors([]);
          setTotalReceiving(0);
          setRecipientName(null);
        })
        .finally(() => setLoading(false));
    } else {
      roomsApi
        .getCalculatorContributors(roomId)
        .then((rows) => {
          setContributors(rows);
          setTotalReceiving(null);
          setRecipientName(null);
        })
        .catch(() => setContributors([]))
        .finally(() => setLoading(false));
    }
  }, [visible, roomId, recipientUserId]);

  const sessionTotal = contributors.reduce((sum, c) => sum + c.points, 0);
  const headerTotal = totalReceiving != null ? totalReceiving : sessionTotal;
  const title = recipientUserId
    ? `Supporters${recipientName ? ` for ${recipientName}` : ''}`
    : 'Supporters';
  const totalLabel = recipientUserId
    ? `Total receiving: ${formatPoints(headerTotal)} pts`
    : `Total: ${formatPoints(headerTotal)} pts`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.xxl }]} onPress={() => {}}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="flame" size={18} color={Colors.gold} />
              <Text style={styles.title}>{title}</Text>
            </View>
            <View style={styles.totalBadge}>
              <Text style={styles.totalText}>{totalLabel}</Text>
            </View>
          </View>

          {loading ? (
            <ActivityIndicator color={Colors.primary} style={styles.loader} />
          ) : contributors.length === 0 ? (
            <Text style={styles.empty}>No supporters yet</Text>
          ) : (
            <FlatList
              data={contributors}
              keyExtractor={(item) => item.senderId}
              renderItem={({ item, index }) => <ContributorRow entry={item} rank={index + 1} />}
              style={styles.list}
              showsVerticalScrollIndicator={false}
            />
          )}

          <TouchableOpacity style={styles.closeBtn} onPress={onDismiss}>
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.lg,
    maxHeight: '70%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E5E5',
    alignSelf: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
    marginRight: Spacing.sm,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0B0B14',
    flexShrink: 1,
  },
  totalBadge: {
    backgroundColor: '#FFF8E1',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  totalText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.gold,
  },
  loader: {
    marginTop: Spacing.xxl,
    marginBottom: Spacing.xxl,
  },
  empty: {
    textAlign: 'center',
    color: '#9090AA',
    fontSize: 14,
    marginTop: Spacing.xxl,
    marginBottom: Spacing.xxl,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  rank: {
    fontSize: 13,
    fontWeight: '700',
    width: 32,
  },
  avatarWrap: {
    marginRight: Spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  avatarFallback: {
    backgroundColor: '#EEE8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 16,
  },
  userInfo: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0B0B14',
  },
  hakaId: {
    fontSize: 11,
    color: '#9090AA',
    marginTop: 1,
  },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFF8E1',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  pointsText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.gold,
  },
  closeBtn: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
