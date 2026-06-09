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

type Props = RootStackScreenProps<'BindBinance'>;

export function BindBinanceScreen({ navigation, route }: Props) {
  const { countryCode, provider } = route.params;
  const insets = useSafeAreaInsets();
  const [bep20Address, setBep20Address] = useState('');
  const [nickname, setNickname] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(bep20Address.trim());
  const canSubmit = isValidAddress && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await paymentsApi.bindBinance({
        country_code: countryCode,
        provider,
        bep20_address: bep20Address.trim(),
        confirm_bep20_address: bep20Address.trim(),
        nickname: nickname.trim(),
      });
      Alert.alert('Success', 'Binance BEP20 address bound successfully', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Please try again');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, countryCode, provider, bep20Address, nickname, navigation]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bind Binance (BEP20)</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAwareScroll
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      >
        <View style={styles.form}>
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={20} color={Colors.primary} />
            <Text style={styles.infoText}>
              Enter your Binance BEP20 (BSC) wallet address. Make sure you use the correct network — sending to the wrong network may result in permanent loss of funds.
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>BEP20 Wallet Address *</Text>
            <TextInput
              style={styles.input}
              value={bep20Address}
              onChangeText={setBep20Address}
              placeholder="0x..."
              placeholderTextColor="#999"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.hint}>
              BEP20 addresses start with "0x" and are 42 characters
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Nickname (optional)</Text>
            <TextInput
              style={styles.input}
              value={nickname}
              onChangeText={setNickname}
              placeholder="Give this method a nickname"
              placeholderTextColor="#999"
              maxLength={30}
            />
          </View>

          <View style={styles.notice}>
            <Ionicons name="shield-checkmark" size={16} color={Colors.primary} />
            <Text style={styles.noticeText}>
              Your wallet address is encrypted and securely stored. Always double-check the address before binding.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            <Text style={styles.submitBtnText}>Bind Binance BEP20</Text>
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
    marginTop: Spacing.md,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: 'rgba(123,79,255,0.08)',
    borderRadius: Radius.md,
    padding: Spacing.lg,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#444',
    lineHeight: 20,
  },
  field: {
    gap: Spacing.xs,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: Radius.md,
    height: 48,
    paddingHorizontal: Spacing.md,
    fontSize: 15,
    color: '#000',
    fontFamily: 'monospace',
  },
  hint: {
    fontSize: 11,
    color: '#999',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: 'rgba(123,79,255,0.06)',
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
  submitBtn: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
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
