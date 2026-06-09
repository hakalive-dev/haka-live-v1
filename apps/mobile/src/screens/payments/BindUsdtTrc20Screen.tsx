import React, { useCallback, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScroll } from '@components/keyboard';
import { Ionicons } from '@expo/vector-icons';

import { paymentsApi } from '@api/payments';
import { Colors, Radius, Spacing } from '@/theme';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'BindUsdtTrc20'>;

export function BindUsdtTrc20Screen({ navigation, route }: Props) {
  const { countryCode, provider } = route.params;
  const insets = useSafeAreaInsets();
  const [trc20Address, setTrc20Address] = useState('');
  const [confirmAddress, setConfirmAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isValidAddress = /^T[a-zA-Z0-9]{33}$/.test(trc20Address.trim());
  const addressesMatch = trc20Address.trim() === confirmAddress.trim();
  const canSubmit = isValidAddress && addressesMatch && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await paymentsApi.bindUsdtTrc20({
        country_code: countryCode,
        provider,
        trc20_address: trc20Address.trim(),
        confirm_trc20_address: confirmAddress.trim(),
      });
      Alert.alert('Success', 'USDT TRC20 address bound successfully', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Please try again');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, countryCode, provider, trc20Address, confirmAddress, navigation]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Binance Bind</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAwareScroll
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      >
        <View style={styles.form}>
          <Text style={styles.sectionTitle}>Account information</Text>

          <View style={styles.field}>
            <Text style={styles.label}>TRC20 Network</Text>
            <TextInput
              style={styles.input}
              value={trc20Address}
              onChangeText={setTrc20Address}
              placeholder="Please enter"
              placeholderTextColor="#999"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Confirm TRC20 Network</Text>
            <TextInput
              style={styles.input}
              value={confirmAddress}
              onChangeText={setConfirmAddress}
              placeholder="Please enter"
              placeholderTextColor="#999"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            <Text style={styles.submitBtnText}>bind</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScroll>
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
  form: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
    marginTop: Spacing.xl,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  field: {
    gap: Spacing.xs,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: Radius.md,
    height: 48,
    paddingHorizontal: Spacing.md,
    fontSize: 15,
    color: '#000',
  },
  submitBtn: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xl,
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
});
