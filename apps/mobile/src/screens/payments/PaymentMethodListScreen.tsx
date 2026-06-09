import React, { useCallback, useState } from 'react';
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

import { paymentsApi } from '@api/payments';
import { PayoutMethodIcon } from '@components/payments/PayoutMethodIcon';
import { Colors, Radius, Spacing } from '@/theme';
import { ListRowSkeleton } from '@components/Skeleton';
import type { UserPaymentMethod } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'PaymentMethodList'>;

const METHOD_LABELS: Record<string, string> = {
  bank_account: 'Bank Account',
  epay: 'Epay',
  binance_bep20: 'Binance (BEP20)',
  usdt_trc20: 'USDT TRC20',
  mobile_wallet: 'Mobile wallet',
  upi: 'UPI',
};

const METHOD_ICONS: Record<string, string> = {
  bank_account: 'business',
  epay: 'card',
  binance_bep20: 'logo-bitcoin',
  usdt_trc20: 'logo-usd',
  mobile_wallet: 'phone-portrait',
  upi: 'wallet',
};

export function PaymentMethodListScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [methods, setMethods] = useState<UserPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  const openBindFlow = useCallback(async () => {
    try {
      const cur = await paymentsApi.getMyCurrency();
      navigation.navigate('BindPaymentMethod', {
        countryCode: cur.country_code,
        currency: cur.currency_code,
        countryName: cur.country_name,
      });
    } catch {
      Alert.alert('Error', 'Could not load your payout country. Set it on the withdraw screen first.');
    }
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      paymentsApi
        .getPaymentMethods()
        .then(setMethods)
        .catch(() => {})
        .finally(() => setLoading(false));
    }, []),
  );

  const handleSetDefault = useCallback(async (id: string) => {
    try {
      await paymentsApi.setDefaultPaymentMethod(id);
      setMethods((prev) =>
        prev.map((m) => ({ ...m, is_default: m.id === id })),
      );
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Please try again');
    }
  }, []);

  const handleDelete = useCallback((id: string) => {
    Alert.alert('Remove Method', 'Are you sure you want to remove this payment method?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await paymentsApi.deletePaymentMethod(id);
            setMethods((prev) => prev.filter((m) => m.id !== id));
          } catch (e: unknown) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Please try again');
          }
        },
      },
    ]);
  }, []);

  const getMethodDetail = (m: UserPaymentMethod): string => m.masked_account;

  const renderItem = ({ item }: { item: UserPaymentMethod }) => (
    <View style={styles.methodCard}>
      <View style={styles.methodIcon}>
        {item.provider ? (
          <PayoutMethodIcon
            provider={item.provider}
            methodType={item.method_type}
            size={40}
          />
        ) : (
          <Ionicons
            name={(METHOD_ICONS[item.method_type] ?? 'card') as keyof typeof Ionicons.glyphMap}
            size={22}
            color={Colors.primary}
          />
        )}
      </View>
      <View style={styles.methodInfo}>
        <View style={styles.methodNameRow}>
          <Text style={styles.methodName}>
            {item.label ?? METHOD_LABELS[item.method_type] ?? item.method_type}
          </Text>
          {item.is_default && (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultBadgeText}>Default</Text>
            </View>
          )}
          {item.nickname ? <Text style={styles.nicknameText}>({item.nickname})</Text> : null}
        </View>
        <Text style={styles.methodDetail}>{getMethodDetail(item)}</Text>
      </View>
      <View style={styles.actions}>
        {!item.is_default && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleSetDefault(item.id)}
          >
            <Text style={styles.setDefaultText}>Set Default</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDelete(item.id)}
        >
          <Ionicons name="trash-outline" size={18} color={Colors.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment Methods</Text>
        <TouchableOpacity onPress={openBindFlow}>
          <Ionicons name="add" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ListRowSkeleton rows={4} />
      ) : methods.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="card-outline" size={48} color="#DDD" />
          <Text style={styles.emptyText}>No payment methods bound</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={openBindFlow}
          >
            <Text style={styles.addBtnText}>Add Payment Method</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={methods}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: Spacing.lg,
            paddingBottom: insets.bottom + Spacing.xl,
            gap: Spacing.md,
            paddingTop: Spacing.md,
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
    backgroundColor: Colors.background,
  },
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
  addBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },

  // Method card
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F8F8',
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  methodIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(123,79,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodInfo: {
    flex: 1,
    gap: 2,
  },
  methodNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  methodName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  defaultBadge: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFF',
  },
  methodDetail: {
    fontSize: 12,
    color: '#999',
  },
  nicknameText: {
    fontSize: 12,
    color: '#999',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  actionBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  setDefaultText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.primary,
  },
  deleteBtn: {
    padding: Spacing.xs,
  },
});
