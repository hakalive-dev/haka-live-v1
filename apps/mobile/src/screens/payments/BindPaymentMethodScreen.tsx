import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { PayoutMethodIcon } from '@components/payments/PayoutMethodIcon';
import { paymentsApi } from '@api/payments';
import { Colors, Radius, Spacing } from '@/theme';
import type { WithdrawalPayoutMethodOption } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'BindPaymentMethod'>;

export function BindPaymentMethodScreen({ navigation, route }: Props) {
  const { countryCode, countryName } = route.params;
  const insets = useSafeAreaInsets();
  const [methods, setMethods] = useState<WithdrawalPayoutMethodOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMethods = useCallback(() => {
    setLoading(true);
    setError(null);
    paymentsApi
      .getWithdrawalMethods(countryCode)
      .then(setMethods)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Failed to load methods');
        setMethods([]);
      })
      .finally(() => setLoading(false));
  }, [countryCode]);

  useFocusEffect(
    useCallback(() => {
      loadMethods();
    }, [loadMethods]),
  );

  const handleBind = (item: WithdrawalPayoutMethodOption) => {
    if (item.alreadyBound) return;

    const { provider, label, methodType } = item;
    const cc = countryCode.toUpperCase();

    if (methodType === 'mobile_wallet' || item.category === 'remittance') {
      navigation.navigate('BindMobileWallet', { countryCode: cc, provider, label });
      return;
    }
    if (methodType === 'upi') {
      navigation.navigate('BindUpi', { countryCode: cc, provider });
      return;
    }
    if (methodType === 'bank_account') {
      navigation.navigate('BindBankAccount', {
        countryCode: cc,
        provider,
        label,
      });
      return;
    }
    if (methodType === 'epay') {
      navigation.navigate('BindEpay', { countryCode: cc, provider });
      return;
    }
    if (methodType === 'binance_bep20') {
      navigation.navigate('BindBinance', { countryCode: cc, provider });
      return;
    }
    if (methodType === 'usdt_trc20') {
      navigation.navigate('BindUsdtTrc20', { countryCode: cc, provider });
    }
  };

  const renderItem = ({ item }: { item: WithdrawalPayoutMethodOption }) => (
    <View style={styles.methodRow}>
      <View style={styles.iconWrap}>
        <PayoutMethodIcon
          provider={item.provider}
          methodType={item.methodType}
          category={item.category}
          size={44}
        />
      </View>

      <View style={styles.methodInfo}>
        <Text style={styles.methodLabel}>{item.label}</Text>
      </View>

      {item.alreadyBound ? (
        <View style={styles.boundBadge}>
          <Text style={styles.boundText}>Bound</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.bindBtn} onPress={() => handleBind(item)}>
          <Text style={styles.bindBtnText}>Bind</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Method</Text>
        <View style={styles.countryBadge}>
          <Text style={styles.countryText}>{countryCode.toUpperCase()}</Text>
        </View>
      </View>

      <Text style={styles.subtitle}>{countryName}</Text>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={Colors.primary} />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadMethods}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={methods}
          keyExtractor={(item) => `${item.provider}-${item.methodType}`}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.md,
            paddingBottom: insets.bottom + Spacing.xl,
          }}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No payout methods for this country</Text>
          }
          ListFooterComponent={
            <TouchableOpacity
              style={styles.preferredLink}
              onPress={() => navigation.navigate('PaymentMethodList')}
            >
              <Text style={styles.preferredText}>
                My most preferred way to receive payment{' '}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
            </TouchableOpacity>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  countryBadge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  countryText: { fontSize: 14, fontWeight: '600', color: '#000' },
  loader: { marginTop: Spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  errorText: { fontSize: 14, color: Colors.danger, textAlign: 'center' },
  retryText: { fontSize: 14, color: Colors.primary, marginTop: Spacing.md },
  emptyText: { textAlign: 'center', color: Colors.textSecondary, marginTop: Spacing.xl },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.md,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodInfo: { flex: 1, gap: Spacing.xs },
  methodLabel: { fontSize: 15, fontWeight: '700', color: '#000' },
  bindBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  bindBtnText: { fontSize: 13, fontWeight: '600', color: '#FFF' },
  boundBadge: {
    backgroundColor: '#E8E8E8',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  boundText: { fontSize: 13, fontWeight: '600', color: '#999' },
  preferredLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xxl,
  },
  preferredText: { fontSize: 13, color: Colors.primary },
});
