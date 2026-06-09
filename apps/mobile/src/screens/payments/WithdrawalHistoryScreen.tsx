import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';

import { walletApi } from '@api/wallet';
import {
  AllTypeFilterBackdrop,
  AllTypeFilterDropdown,
} from '@components/AllTypeFilterDropdown';
import { UserAvatar } from '@components/UserAvatar';
import { ListRowSkeleton } from '@components/Skeleton';
import { Colors, Radius, Spacing } from '@/theme';
import type { BeanRecord, BeanRecordCategory, BeanRecordGiftIncome } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'WithdrawalHistory'>;

const beanIcon = require('../../../assets/bean.png');

type RecordFilter = 'all' | BeanRecordCategory;

const FILTER_OPTIONS: { value: RecordFilter; label: string }[] = [
  { value: 'all', label: 'All Type' },
  { value: 'gift_received', label: 'Gift Income' },
  { value: 'creator_commission', label: 'Creator Commission' },
  { value: 'payroll_commission', label: 'Payroll' },
  { value: 'exchange', label: 'Exchange' },
  { value: 'withdrawal', label: 'Withdrawal' },
];

const STATUS_COLORS: Record<string, string> = {
  pending: Colors.warning,
  pending_review: Colors.warning,
  assigned: '#6366F1',
  proof_submitted: '#0EA5E9',
  completed: Colors.success,
  approved: Colors.info,
  paid: Colors.success,
  rejected: Colors.danger,
  disputed: Colors.warning,
};

const USER_STATUS_LABEL: Record<string, string> = {
  pending_review: 'Under review',
  pending: 'Under review',
  assigned: 'Processing',
  proof_submitted: 'Processing',
  completed: 'Paid',
  approved: 'Paid',
  rejected: 'Rejected',
  disputed: 'Disputed',
};

function statusLabel(status: string): string {
  const key = status === 'pending' ? 'pending_review' : status;
  return USER_STATUS_LABEL[key] ?? key.replace(/_/g, ' ');
}

function isSuccessfulWithdrawal(status: string | null): boolean {
  return status === 'completed' || status === 'approved' || status === 'paid';
}

function formatRecordTimestamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function signedAmount(item: BeanRecord): string {
  const sign = item.transactionType === 'credit' ? '+' : '−';
  return `${sign}${item.amount.toLocaleString()}`;
}

function BeanAmount({ item }: { item: BeanRecord }) {
  const color = item.transactionType === 'credit' ? Colors.coin : Colors.textPrimary;
  return (
    <View style={styles.amountRow}>
      <Text style={[styles.amountText, { color }]}>{signedAmount(item)}</Text>
      <Image source={beanIcon} style={styles.beanIcon} contentFit="contain" />
    </View>
  );
}

function GiftIncomeCard({ item, gift }: { item: BeanRecord; gift: BeanRecordGiftIncome }) {
  const icon = gift.gift_icon || '🎁';
  const hakaId = gift.sender_haka_id || '';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.giftTitleRow}>
          <Text style={styles.cardTitle}>Gift Income</Text>
          <Text style={styles.giftEmoji}>{icon}</Text>
          <Text style={styles.giftQty}>x{gift.gift_qty}</Text>
        </View>
        <BeanAmount item={item} />
      </View>

      <View style={styles.fromRow}>
        <Text style={styles.fromLabel}>From</Text>
        <UserAvatar
          user={{
            displayName: gift.sender_display_name,
            avatar: gift.sender_avatar,
          }}
          size={28}
          hideFrame
        />
        <Text style={styles.fromName} numberOfLines={1}>
          {gift.sender_display_name}
          {hakaId ? (
            <Text style={styles.fromId}> (ID:{hakaId})</Text>
          ) : null}
        </Text>
      </View>

      <Text style={styles.timestamp}>{formatRecordTimestamp(item.createdAt)}</Text>
    </View>
  );
}

function CreatorCommissionCard({ item }: { item: BeanRecord }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardTitle}>Creator Commission</Text>
        <BeanAmount item={item} />
      </View>
      <Text style={styles.timestamp}>{formatRecordTimestamp(item.createdAt)}</Text>
    </View>
  );
}

function PayrollPayoutCard({ item }: { item: BeanRecord }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardTitle}>Payroll payout</Text>
        <BeanAmount item={item} />
      </View>
      {item.description ? (
        <Text style={styles.description} numberOfLines={3}>{item.description}</Text>
      ) : null}
      <Text style={styles.timestamp}>{formatRecordTimestamp(item.createdAt)}</Text>
    </View>
  );
}

function PayrollCommissionCard({ item }: { item: BeanRecord }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardTitle}>Payroll commission</Text>
        <BeanAmount item={item} />
      </View>
      {item.description ? (
        <Text style={styles.description} numberOfLines={3}>{item.description}</Text>
      ) : null}
      <Text style={styles.timestamp}>{formatRecordTimestamp(item.createdAt)}</Text>
    </View>
  );
}

function GenericRecordCard({
  item,
  onDispute,
  disputing,
}: {
  item: BeanRecord;
  onDispute?: () => void;
  disputing?: boolean;
}) {
  const title = item.category === 'exchange' ? 'Exchange' : 'Withdrawal';
  const showStatus = item.category === 'withdrawal' && item.withdrawalStatus != null;
  const statusKey = item.withdrawalStatus ? statusLabel(item.withdrawalStatus) : '';
  const statusColor = STATUS_COLORS[item.withdrawalStatus ?? ''] ?? Colors.textTertiary;
  const showOrderId =
    item.category === 'withdrawal' &&
    isSuccessfulWithdrawal(item.withdrawalStatus) &&
    !!item.orderId?.trim();
  const canDispute =
    item.category === 'withdrawal' &&
    item.withdrawalStatus === 'completed' &&
    !!item.withdrawalId &&
    !!onDispute;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.titleCol}>
          <Text style={styles.cardTitle}>{title}</Text>
          {showOrderId ? (
            <Text style={styles.orderIdText}>Order ID: {item.orderId}</Text>
          ) : null}
        </View>
        <View style={styles.headerRight}>
          <BeanAmount item={item} />
          {showStatus ? (
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {statusKey.replace(/_/g, ' ').toUpperCase()}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      {item.description ? (
        <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
      ) : null}
      <Text style={styles.timestamp}>{formatRecordTimestamp(item.createdAt)}</Text>
      {canDispute ? (
        <TouchableOpacity
          style={[styles.disputeBtn, disputing && { opacity: 0.5 }]}
          onPress={onDispute}
          disabled={disputing}
        >
          <Text style={styles.disputeBtnText}>
            {disputing ? 'Submitting…' : 'Raise Dispute'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function RecordCard({
  item,
  onDispute,
  disputing,
}: {
  item: BeanRecord;
  onDispute?: (item: BeanRecord) => void;
  disputing?: boolean;
}) {
  if (item.category === 'gift_received') {
    if (item.gift_income) {
      return <GiftIncomeCard item={item} gift={item.gift_income} />;
    }
    return (
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Gift Income</Text>
          <BeanAmount item={item} />
        </View>
        {item.description ? (
          <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
        ) : null}
        <Text style={styles.timestamp}>{formatRecordTimestamp(item.createdAt)}</Text>
      </View>
    );
  }
  if (item.category === 'creator_commission') {
    return <CreatorCommissionCard item={item} />;
  }
  if (item.category === 'payroll_payout') {
    return <PayrollPayoutCard item={item} />;
  }
  if (item.category === 'payroll_commission') {
    return <PayrollCommissionCard item={item} />;
  }
  return (
    <GenericRecordCard
      item={item}
      onDispute={
        item.category === 'withdrawal' && item.withdrawalStatus === 'completed' && item.withdrawalId
          ? () => onDispute?.(item)
          : undefined
      }
      disputing={disputing}
    />
  );
}

export function WithdrawalHistoryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [records, setRecords] = useState<BeanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<RecordFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [disputingId, setDisputingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      setError(false);
      walletApi
        .getBeanRecords()
        .then((data) => setRecords(data.items))
        .catch(() => setError(true))
        .finally(() => setLoading(false));
    }, []),
  );

  const handleDispute = useCallback((item: BeanRecord) => {
    if (!item.withdrawalId) return;
    Alert.prompt(
      'Raise Dispute',
      'Describe the issue (e.g. payment not received):',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async (reason?: string) => {
            if (!reason?.trim()) {
              Alert.alert('Required', 'Please enter a reason.');
              return;
            }
            setDisputingId(item.id);
            try {
              await walletApi.disputeWithdrawal(item.withdrawalId!, reason.trim());
              Alert.alert('Submitted', 'Your dispute has been submitted for admin review.');
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed to submit dispute');
            } finally {
              setDisputingId(null);
            }
          },
        },
      ],
      'plain-text',
    );
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return records;
    if (filter === 'payroll_commission') {
      return records.filter(
        (r) => r.category === 'payroll_commission' || r.category === 'payroll_payout',
      );
    }
    return records.filter((r) => r.category === filter);
  }, [records, filter]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Records</Text>
        <View style={{ width: 24 }} />
      </View>

      {!loading && !error ? (
        <View style={styles.filterRow}>
          <AllTypeFilterDropdown
            value={filter}
            onChange={setFilter}
            options={FILTER_OPTIONS}
            open={filterOpen}
            onOpenChange={setFilterOpen}
          />
        </View>
      ) : null}

      {filterOpen ? (
        <AllTypeFilterBackdrop onPress={() => setFilterOpen(false)} />
      ) : null}

      {loading ? (
        <ListRowSkeleton rows={6} />
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.danger} />
          <Text style={styles.emptyText}>Failed to load records</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <RecordCard
              item={item}
              onDispute={handleDispute}
              disputing={disputingId === item.id}
            />
          )}
          ListEmptyComponent={
            <View style={styles.centerList}>
              <Ionicons name="receipt-outline" size={48} color={Colors.textTertiary} />
              <Text style={styles.emptyText}>No records yet</Text>
              <Text style={styles.emptyHint}>
                Gifts received, creator commission, exchanges, and withdrawals appear here.
              </Text>
            </View>
          }
          contentContainerStyle={{
            paddingHorizontal: Spacing.lg,
            paddingBottom: insets.bottom + Spacing.xl,
            gap: Spacing.md,
            paddingTop: Spacing.sm,
            flexGrow: filtered.length === 0 ? 1 : undefined,
          }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F2F2',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.background,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  centerList: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textTertiary,
  },
  emptyHint: {
    fontSize: 12,
    color: Colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    lineHeight: 18,
  },
  filterRow: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    zIndex: 30,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  titleCol: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  orderIdText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '400',
  },
  giftTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    flexWrap: 'wrap',
    gap: 4,
  },
  giftEmoji: {
    fontSize: 16,
  },
  giftQty: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  amountText: {
    fontSize: 16,
    fontWeight: '700',
  },
  beanIcon: {
    width: 18,
    height: 18,
  },
  fromRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  fromLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  fromName: {
    flex: 1,
    fontSize: 13,
    color: '#333333',
    fontWeight: '500',
  },
  fromId: {
    color: Colors.textTertiary,
    fontWeight: '400',
  },
  timestamp: {
    fontSize: 12,
    color: '#AAAAAA',
    marginTop: Spacing.xs,
  },
  description: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  statusBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  disputeBtn: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warning,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
  },
  disputeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.warning,
  },
});
