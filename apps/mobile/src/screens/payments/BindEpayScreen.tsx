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

type Props = RootStackScreenProps<'BindEpay'>;

export function BindEpayScreen({ navigation, route }: Props) {
  const { countryCode, provider } = route.params;
  const insets = useSafeAreaInsets();
  const [epayAccount, setEpayAccount] = useState('');
  const [confirmAccount, setConfirmAccount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const accountsMatch = epayAccount.trim() === confirmAccount.trim();
  const canSubmit = epayAccount.trim().length > 0 && accountsMatch && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await paymentsApi.bindEpay({
        country_code: countryCode,
        provider,
        epay_account: epayAccount.trim(),
        confirm_epay_account: confirmAccount.trim(),
      });
      Alert.alert('Success', 'Epay account bound successfully', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Please try again');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, countryCode, provider, epayAccount, confirmAccount, navigation]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Epay Bind</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAwareScroll
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      >
        <View style={styles.form}>
          <Text style={styles.sectionTitle}>Account information</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Epay Account</Text>
            <TextInput
              style={styles.input}
              value={epayAccount}
              onChangeText={setEpayAccount}
              placeholder="Please enter"
              placeholderTextColor="#999"
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Confirm Epay Account</Text>
            <TextInput
              style={styles.input}
              value={confirmAccount}
              onChangeText={setConfirmAccount}
              placeholder="Please enter"
              placeholderTextColor="#999"
              autoCapitalize="none"
              keyboardType="email-address"
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
