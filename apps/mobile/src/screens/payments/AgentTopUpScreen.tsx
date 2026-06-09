import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScroll } from '@components/keyboard';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { agencyApi } from '@api/agency';
import { paymentsApi } from '@api/payments';
import { CountryCurrencyPicker } from '@components/payments/CountryCurrencyPicker';
import { Colors, Radius, Spacing } from '@/theme';
import { ListRowSkeleton } from '@components/Skeleton';
import type { AgentSale } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'AgentTopUp'>;

export function AgentTopUpScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  const [sales, setSales]           = useState<AgentSale[]>([]);
  const [loading, setLoading]       = useState(true);
  const [customerId, setCustomerId] = useState('');
  const [coins, setCoins]           = useState('');
  const [amount, setAmount]         = useState('');
  const [currency, setCurrency]     = useState('GBP');
  const [currencyLabel, setCurrencyLabel] = useState('United Kingdom (GBP)');
  const [countryCode, setCountryCode] = useState('GB');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [notes, setNotes]           = useState('');
  const [submitting, setSubmitting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      paymentsApi.getAgentSales()
        .then(setSales)
        .catch(() => {})
        .finally(() => setLoading(false));
    }, []),
  );

  const canSubmit = customerId.trim().length > 0
    && parseInt(coins, 10) > 0
    && parseFloat(amount) > 0
    && !submitting;

  const handleCreate = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await agencyApi.logSale(
        customerId.trim(),
        parseInt(coins, 10),
        parseFloat(amount),
        currency,
        notes.trim(),
      );
      const refreshed = await paymentsApi.getAgentSales();
      setSales(refreshed);
      setCustomerId(''); setCoins(''); setAmount(''); setNotes('');
      Alert.alert('Done!', `${parseInt(coins, 10).toLocaleString()} coins credited to the customer.`);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Please try again');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, customerId, coins, amount, currency, notes]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Agent Top-Up</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScroll contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }}>
        {/* Form */}
        <View style={styles.formSection}>
          <Text style={styles.sectionLabel}>Record a Coin Sale</Text>

          <Text style={styles.label}>Customer Haka ID or User ID</Text>
          <TextInput
            style={styles.input}
            value={customerId}
            onChangeText={setCustomerId}
            placeholder="e.g. USR001 or UUID"
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
          />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Coins Sold</Text>
              <TextInput
                style={styles.input}
                value={coins}
                onChangeText={setCoins}
                placeholder="500"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Amount Collected</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                placeholder="5.00"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <Text style={styles.label}>Currency collected</Text>
          <TouchableOpacity style={styles.input} onPress={() => setPickerOpen(true)}>
            <Text style={styles.currencyPickerText}>{currencyLabel}</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={styles.input}
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. Cash payment"
            placeholderTextColor={Colors.textTertiary}
          />

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={16} color={Colors.info} />
            <Text style={styles.infoText}>
              Coins are credited to the customer immediately. This action is logged and cannot be reversed.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={handleCreate}
            disabled={!canSubmit}
          >
            <>
                <Ionicons name="add-circle" size={18} color="#FFFFFF" />
                <Text style={styles.submitBtnText}>Credit Coins</Text>
              </>
          </TouchableOpacity>
        </View>

        {/* Recent sales */}
        <Text style={styles.historyTitle}>Recent Sales</Text>
        {loading ? (
          <ListRowSkeleton rows={4} />
        ) : sales.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No sales recorded yet</Text>
          </View>
        ) : (
          sales.map((s) => (
            <View key={s.id} style={styles.saleRow}>
              <View style={styles.saleIcon}>
                <Ionicons name="logo-bitcoin" size={20} color={Colors.coin} />
              </View>
              <View style={styles.saleInfo}>
                <Text style={styles.saleName}>
                  {s.customer.displayName || s.customer.username}
                </Text>
                <Text style={styles.saleDate}>
                  {new Date(s.created_at).toLocaleDateString()}
                  {s.notes ? ` · ${s.notes}` : ''}
                </Text>
              </View>
              <View style={styles.saleRight}>
                <Text style={styles.saleCoins}>+{s.coins_sold.toLocaleString()} 🪙</Text>
                <Text style={styles.saleAmount}>{s.currency} {s.amount_collected}</Text>
              </View>
            </View>
          ))
        )}
      </KeyboardAwareScroll>

      <CountryCurrencyPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedCountryCode={countryCode}
        title="Sale currency"
        onSelect={(item) => {
          setCurrency(item.currency);
          setCountryCode(item.countryCode);
          setCurrencyLabel(`${item.countryName} (${item.currency})`);
        }}
      />
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
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, color: Colors.textPrimary, fontSize: 17, fontWeight: '700', textAlign: 'center' },

  formSection: { padding: Spacing.lg, gap: Spacing.sm },
  sectionLabel: {
    color: Colors.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: Spacing.sm,
  },
  label: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  row:   { flexDirection: 'row', gap: Spacing.sm },
  input: {
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, height: 52, paddingHorizontal: Spacing.md,
    color: Colors.textPrimary, fontSize: 15,
    justifyContent: 'center',
  },
  currencyPickerText: {
    color: Colors.textPrimary,
    fontSize: 15,
  },
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs,
    backgroundColor: '#4DA6FF18', borderRadius: Radius.md, padding: Spacing.sm,
  },
  infoText: { color: Colors.textSecondary, fontSize: 12, flex: 1, lineHeight: 17 },
  submitBtn: {
    height: 52, backgroundColor: Colors.primary, borderRadius: Radius.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, marginTop: Spacing.sm,
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  historyTitle: {
    color: Colors.textSecondary, fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1,
    paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm,
  },
  emptyBox:  { alignItems: 'center', paddingVertical: Spacing.xl },
  emptyText: { color: Colors.textTertiary, fontSize: 14 },

  saleRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  saleIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.goldSubtle, alignItems: 'center', justifyContent: 'center',
  },
  saleInfo:   { flex: 1 },
  saleName:   { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  saleDate:   { color: Colors.textTertiary, fontSize: 12, marginTop: 2 },
  saleRight:  { alignItems: 'flex-end' },
  saleCoins:  { color: Colors.coin, fontSize: 14, fontWeight: '700' },
  saleAmount: { color: Colors.textTertiary, fontSize: 12, marginTop: 2 },
});
