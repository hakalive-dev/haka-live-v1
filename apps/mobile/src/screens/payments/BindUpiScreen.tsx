import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScroll } from '@components/keyboard';
import { Ionicons } from '@expo/vector-icons';

import { PayoutBindForm } from '@components/payments/PayoutBindForm';
import { PayoutMethodIcon } from '@components/payments/PayoutMethodIcon';
import { paymentsApi } from '@api/payments';
import { Colors, Spacing } from '@/theme';
import {
  getPayoutBindFields,
  isPayoutBindFormValid,
  type PayoutBindFormValues,
} from '@/utils/payoutBindFields';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'BindUpi'>;

export function BindUpiScreen({ navigation, route }: Props) {
  const { countryCode, provider } = route.params;
  const insets = useSafeAreaInsets();
  const [values, setValues] = useState<PayoutBindFormValues>({});
  const [submitting, setSubmitting] = useState(false);

  const fields = useMemo(
    () => getPayoutBindFields(countryCode, provider, 'upi'),
    [countryCode, provider],
  );

  const canSubmit =
    isPayoutBindFormValid(countryCode, provider, values) && !submitting;

  const handleChange = useCallback((key: keyof PayoutBindFormValues, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await paymentsApi.bindUpi({
        country_code: countryCode,
        provider,
        vpa: values.vpa!.trim(),
        confirm_vpa: values.confirmVpa!.trim(),
      });
      Alert.alert('Success', 'UPI ID bound successfully', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Please try again');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, countryCode, provider, values, navigation]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <PayoutMethodIcon provider={provider} methodType="upi" size={28} />
          <Text style={styles.headerTitle}>UPI Bind</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAwareScroll
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      >
        <PayoutBindForm
          fields={fields}
          values={values}
          onChange={handleChange}
          onSubmit={handleSubmit}
          canSubmit={canSubmit}
        />
      </KeyboardAwareScroll>
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
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
});
