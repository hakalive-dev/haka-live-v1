import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { coinSellerApi } from '@api/coinSeller';
import {
  AllTypeFilterBackdrop,
  AllTypeFilterDropdown,
  type AllTypeFilterOption,
} from '@components/AllTypeFilterDropdown';
import { Colors, Radius, Spacing } from '@/theme';
import { ListRowSkeleton } from '@components/Skeleton';
import type { CoinSellerTargetType, CoinSellerTransaction, CoinSellerTransactionType } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'CoinSellerDetails'>;

const BG = '#F0F9F6';
const PRIMARY = '#5B2FD4';
const SEARCH_BG = '#E8E8E8';
const CARD_BG = '#FFFFFF';

const FILTERS = ['All', 'Transfer', 'Recharge', 'Exchange'] as const;
type Filter = (typeof FILTERS)[number];

const TYPE_FILTER_OPTIONS: AllTypeFilterOption<Filter>[] = [
  { value: 'All', label: 'All Type' },
  { value: 'Transfer', label: 'Transfer' },
  { value: 'Recharge', label: 'Recharge' },
  { value: 'Exchange', label: 'Exchange' },
];

const TYPE_LABELS: Record<CoinSellerTransactionType, string> = {
  transfer: 'Transfer',
  recharge: 'Recharge',
  exchange: 'Exchange',
};

function transferLabel(targetType: CoinSellerTargetType | ''): string {
  return targetType === 'coin_seller' ? 'Transfer to Coin Seller' : 'Transfer to User';
}

function counterpartyTitle(item: CoinSellerTransaction): string {
  const cp = item.counterparty;
  if (cp) {
    return cp.displayName?.trim() || cp.username?.trim() || cp.hakaId?.trim() || 'User';
  }
  if (item.transaction_type === 'recharge') return 'Seller balance funding';
  if (item.transaction_type === 'exchange') return 'Point exchange';
  return 'Recipient unavailable';
}

function counterpartyIdLine(item: CoinSellerTransaction): string {
  const cp = item.counterparty;
  if (!cp) return '';
  return (cp.activeSpecialId ?? cp.hakaId ?? '').trim();
}

function counterpartySubtitle(item: CoinSellerTransaction): string {
  const id = counterpartyIdLine(item);
  if (id) return id;
  const notes = item.notes?.trim();
  if (notes) return notes;
  if (item.transaction_type === 'recharge') return 'Coins credited to seller inventory';
  if (item.transaction_type === 'exchange') return 'Seller inventory adjustment';
  return '';
}

function formatTxnDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}

function transactionMatchesSearch(t: CoinSellerTransaction, q: string): boolean {
  if (!q) return true;
  const cp = t.counterparty;
  if (!cp) {
    return t.notes.toLowerCase().includes(q) || t.operator_name.toLowerCase().includes(q);
  }
  const idStr = `${cp.activeSpecialId ?? ''} ${cp.hakaId ?? ''} ${cp.id}`.toLowerCase();
  return (
    idStr.includes(q)
    || (cp.displayName?.toLowerCase().includes(q) ?? false)
    || (cp.username?.toLowerCase().includes(q) ?? false)
  );
}

function shouldShowOperator(item: CoinSellerTransaction): boolean {
  const opName = item.operator_name?.trim() ?? '';
  const operatorAvatarUri = (item as { operator_avatar_url?: string }).operator_avatar_url;
  if (operatorAvatarUri) return true;
  if (!opName) return false;
  const lower = opName.toLowerCase();
  return lower !== 'system' && lower !== '—';
}

type TransactionCardProps = {
  item: CoinSellerTransaction;
};

function TransactionCard({ item }: TransactionCardProps) {
  const isDebit = item.transaction_type === 'transfer';
  const cp = item.counterparty;
  const operatorAvatarUri: string | undefined = (item as { operator_avatar_url?: string }).operator_avatar_url;
  const typeTitle =
    item.transaction_type === 'transfer'
      ? transferLabel(item.target_type)
      : TYPE_LABELS[item.transaction_type] ?? item.transaction_type;
  const avatarUri = cp?.avatar?.trim() ?? '';
  const titleForAvatar = counterpartyTitle(item);
  const subtitle = counterpartySubtitle(item);
  const opName = item.operator_name?.trim() ?? '';
  const showOperator = shouldShowOperator(item);
  const amountStr = `${isDebit ? '-' : '+'}${item.coins_amount}`;

  return (
    <View style={styles.txnCard}>
      <View style={styles.txnCardHeader}>
        <Text style={styles.txnTypeLabel} numberOfLines={2}>
          {typeTitle}
        </Text>
        <View style={styles.txnAmountWrap}>
          <Text style={styles.txnAmount}>{amountStr}</Text>
          <View style={styles.coinBadge}>
            <Image
              source={require('../../../assets/coin.png')}
              style={styles.coinIconInner}
              contentFit="contain"
            />
          </View>
        </View>
      </View>

      <View style={styles.txnUserRow}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.cpAvatar} contentFit="cover" />
        ) : (
          <View style={[styles.cpAvatar, styles.cpAvatarFallback]}>
            <Text style={styles.cpAvatarText}>
              {titleForAvatar[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
        )}
        <View style={styles.txnUserText}>
          <Text style={styles.txnName} numberOfLines={1}>
            {counterpartyTitle(item)}
          </Text>
          {subtitle ? (
            <Text style={styles.txnUserId} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.txnFooterRow}>
        <Text style={styles.txnDate}>{formatTxnDate(item.created_at)}</Text>
        {showOperator ? (
          <View style={styles.txnOperatorCluster}>
            <Text style={styles.txnOperatorPrefix}>Operator:</Text>
            {operatorAvatarUri ? (
              <Image
                source={{ uri: operatorAvatarUri }}
                style={styles.operatorAvatar}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.operatorAvatar, styles.operatorAvatarFallback]}>
                <Text style={styles.operatorAvatarLetter}>
                  {(opName || 'S')[0]?.toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.txnOperatorName} numberOfLines={1}>
              {opName}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function CoinSellerDetailsScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const initialFilter = route.params?.filterType
    ? (FILTERS.find((f) => f.toLowerCase() === route.params.filterType) ?? 'All')
    : 'All';
  const [filter, setFilter] = useState<Filter>(initialFilter as Filter);
  const [userIdSearch, setUserIdSearch] = useState('');
  const [transactions, setTransactions] = useState<CoinSellerTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const typeParam =
        filter === 'All' ? undefined : (filter.toLowerCase() as CoinSellerTransactionType);
      const data = await coinSellerApi.getTransactions(typeParam);
      setTransactions(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredTransactions = useMemo(() => {
    const q = userIdSearch.trim().toLowerCase();
    if (!q) return transactions;
    return transactions.filter((t) => transactionMatchesSearch(t, q));
  }, [transactions, userIdSearch]);

  const emptyMessage =
    transactions.length === 0
      ? 'No transactions found.'
      : 'No matching transactions.';

  const listBottomPadding = insets.bottom + Spacing.md;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.toolbar}>
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Please input the user id"
            placeholderTextColor="#999"
            value={userIdSearch}
            onChangeText={setUserIdSearch}
            keyboardType="default"
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          <Ionicons name="search" size={18} color="#999" />
        </View>

        <AllTypeFilterDropdown
          value={filter}
          onChange={setFilter}
          options={TYPE_FILTER_OPTIONS}
          open={filterOpen}
          onOpenChange={setFilterOpen}
        />
      </View>

      {filterOpen ? (
        <AllTypeFilterBackdrop onPress={() => setFilterOpen(false)} />
      ) : null}

      {loading ? (
        <View style={styles.listArea}>
          <ListRowSkeleton rows={6} />
        </View>
      ) : (
        <FlatList
          style={styles.listArea}
          data={filteredTransactions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <TransactionCard item={item} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>{emptyMessage}</Text>
          }
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: listBottomPadding },
          ]}
          ItemSeparatorComponent={() => <View style={styles.cardSeparator} />}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: BG,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  headerSpacer: { width: 22 },

  toolbar: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    zIndex: 30,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SEARCH_BG,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    minHeight: 40,
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#000',
    minHeight: 40,
    paddingVertical: 0,
  },

  listArea: {
    flex: 1,
    zIndex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
    flexGrow: 0,
  },
  cardSeparator: { height: Spacing.sm },

  txnCard: {
    backgroundColor: CARD_BG,
    borderRadius: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  txnCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  txnTypeLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
  txnAmountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  txnAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  coinBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.coin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinIconInner: {
    width: 14,
    height: 14,
  },

  txnUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  cpAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  cpAvatarFallback: {
    backgroundColor: '#D8D8D8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cpAvatarText: { fontSize: 14, fontWeight: '600', color: '#666' },

  txnUserText: { flex: 1, justifyContent: 'center' },
  txnName: { fontSize: 14, fontWeight: '700', color: '#000' },
  txnUserId: {
    fontSize: 13,
    fontWeight: '400',
    color: '#333',
    marginTop: 1,
  },

  txnFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  txnDate: {
    fontSize: 11,
    color: '#888',
    flexShrink: 0,
  },
  txnOperatorCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
    maxWidth: '58%',
    justifyContent: 'flex-end',
  },
  txnOperatorPrefix: {
    fontSize: 11,
    color: '#888',
  },
  txnOperatorName: {
    fontSize: 11,
    fontWeight: '500',
    color: '#333',
    flexShrink: 1,
  },
  operatorAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  operatorAvatarFallback: {
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  operatorAvatarLetter: {
    fontSize: 8,
    fontWeight: '700',
    color: '#666',
  },

  emptyText: {
    fontSize: 13,
    color: '#999',
    textAlign: 'left',
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
});
