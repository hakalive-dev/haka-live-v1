import React, { useCallback, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { paymentsApi } from '@api/payments';
import { Colors, Radius, Spacing } from '@/theme';
import { ListRowSkeleton } from '@components/Skeleton';
import type { PaymentTransaction } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'PaymentHistory'>;

const STATUS_COLOR: Record<string, string> = {
  pending:   Colors.warning,
  succeeded: Colors.success,
  failed:    Colors.danger,
  cancelled: Colors.textTertiary,
};

const METHOD_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  card:       'card-outline',
  apple_pay:  'logo-apple',
  google_pay: 'logo-google',
  free:       'gift-outline',
  coin_seller: 'storefront-outline',
  upi:        'phone-portrait-outline',
  epay:       'wallet-outline',
  usdt:       'logo-bitcoin',
  usdc:       'logo-bitcoin',
};

function methodSubtitle(item: PaymentTransaction): string {
  if (item.method === 'free' || item.type === 'coin_seller_purchase') return '';
  return ` · ${item.method.replace(/_/g, ' ')}`;
}

function formatAmount(txn: PaymentTransaction): string {
  return `$${txn.amount_usd.toFixed(2)}`;
}

export function PaymentHistoryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [txns, setTxns]       = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      setError(false);
      paymentsApi.getHistory()
        .then(setTxns)
        .catch(() => setError(true))
        .finally(() => setLoading(false));
    }, []),
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Purchase History</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Rate info */}
      <View style={styles.rateBanner}>
        <Ionicons name="information-circle-outline" size={15} color={Colors.textTertiary} />
        <Text style={styles.rateText}>10,000 coins = $1.00 USD · 1 bean = 1 coin</Text>
      </View>

      {loading ? (
        <ListRowSkeleton rows={6} />
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={Colors.danger} />
          <Text style={styles.errorText}>Failed to load history</Text>
        </View>
      ) : (
        <FlatList
          data={txns}
          keyExtractor={(t) => t.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.xxxl }]}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="receipt-outline" size={40} color={Colors.textTertiary} />
              <Text style={styles.emptyText}>No purchases yet</Text>
              <Text style={styles.emptyHint}>
                Coin purchases from a seller appear here after they credit your wallet.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={[
                styles.iconWrap,
                item.type === 'free_topup' && { backgroundColor: Colors.goldSubtle },
                item.type === 'coin_seller_purchase' && { backgroundColor: Colors.beanSubtle },
              ]}>
                <Ionicons
                  name={METHOD_ICON[item.method] ?? 'card-outline'}
                  size={20}
                  color={
                    item.type === 'free_topup'
                      ? Colors.gold
                      : item.type === 'coin_seller_purchase'
                        ? Colors.bean
                        : Colors.primary
                  }
                />
              </View>
              <View style={styles.info}>
                <Text style={styles.packageName}>{item.package_name}</Text>
                <Text style={styles.date}>
                  {new Date(item.created_at).toLocaleDateString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric',
                  })}
                  {methodSubtitle(item)}
                </Text>
              </View>
              <View style={styles.right}>
                <View style={styles.amountRow}>
                  <Text style={styles.amount}>{formatAmount(item)}</Text>
                  {item.type === 'free_topup' && (
                    <View style={styles.freePill}>
                      <Text style={styles.freePillText}>FREE</Text>
                    </View>
                  )}
                </View>
                <View style={[styles.statusPill, { backgroundColor: STATUS_COLOR[item.status] + '22' }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLOR[item.status] }]}>
                    {item.status.toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, color: Colors.textPrimary, fontSize: 17, fontWeight: '700', textAlign: 'center' },

  rateBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  rateText: { color: Colors.textTertiary, fontSize: 11 },

  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  errorText: { color: Colors.textSecondary, fontSize: 14 },
  listContent: { paddingBottom: Spacing.xxxl },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.primarySubtle, alignItems: 'center', justifyContent: 'center',
  },
  info:        { flex: 1 },
  packageName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  date:        { color: Colors.textTertiary, fontSize: 12, marginTop: 2 },
  right:     { alignItems: 'flex-end', gap: 4 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  amount:    { color: Colors.textPrimary, fontSize: 14, fontWeight: '700' },
  freePill:  { backgroundColor: Colors.goldSubtle, borderRadius: Radius.full, paddingHorizontal: 5, paddingVertical: 1 },
  freePillText: { color: Colors.gold, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  statusPill:  { borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  statusText:  { fontSize: 10, fontWeight: '700' },

  emptyBox:  { alignItems: 'center', paddingTop: 60, gap: Spacing.sm },
  emptyText: { color: Colors.textTertiary, fontSize: 14 },
  emptyHint: {
    color: Colors.textTertiary,
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    lineHeight: 18,
  },
});
