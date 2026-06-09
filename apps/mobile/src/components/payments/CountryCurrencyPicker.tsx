import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { paymentsApi, type CountryCurrency } from '@api/payments';
import { Colors, Radius, Spacing } from '@/theme';

export type CountryCurrencySelection = CountryCurrency & {
  minWithdrawalBeans?: number;
  beansToCurrencyRate?: number;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (item: CountryCurrencySelection) => void;
  selectedCountryCode?: string;
  title?: string;
  /** Withdraw screen: only the 13 payout countries. Default lists all active currencies. */
  withdrawalOnly?: boolean;
};

export function CountryCurrencyPicker({
  visible,
  onClose,
  onSelect,
  selectedCountryCode,
  title = 'Select country',
  withdrawalOnly = false,
}: Props) {
  const [items, setItems] = useState<CountryCurrencySelection[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = withdrawalOnly
        ? await paymentsApi.getWithdrawalCurrencies()
        : await paymentsApi.getCurrencies();
      setItems(rows);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [withdrawalOnly]);

  useEffect(() => {
    if (visible) {
      setQuery('');
      load();
    }
  }, [visible, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (r) =>
        r.countryName.toLowerCase().includes(q) ||
        r.countryCode.toLowerCase().includes(q) ||
        r.currency.toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Search country or currency…"
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {loading ? (
            <Text style={styles.hint}>Loading…</Text>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.countryCode}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const selected = item.countryCode === selectedCountryCode;
                return (
                  <TouchableOpacity
                    style={[styles.row, selected && styles.rowSelected]}
                    onPress={() => {
                      onSelect(item);
                      onClose();
                    }}
                  >
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle}>{item.countryName}</Text>
                      <Text style={styles.rowSub}>
                        {item.currency} · {item.symbol}
                      </Text>
                    </View>
                    {selected ? (
                      <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
                    ) : null}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.hint}>No countries match your search.</Text>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '85%',
    paddingBottom: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  search: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    height: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    fontSize: 15,
    color: Colors.textPrimary,
    backgroundColor: Colors.surfaceElevated,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowSelected: {
    backgroundColor: Colors.primarySubtle,
  },
  rowText: { flex: 1 },
  rowTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  rowSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  hint: {
    textAlign: 'center',
    padding: Spacing.xl,
    color: Colors.textTertiary,
    fontSize: 14,
  },
});
