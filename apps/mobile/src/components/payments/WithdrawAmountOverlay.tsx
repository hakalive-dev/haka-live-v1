import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import {
  WITHDRAWAL_BEAN_STEP,
  WITHDRAWAL_DAILY_LIMIT_BEANS,
  WITHDRAWAL_MIN_BEANS,
} from '@haka-live/shared-types/withdrawal-limits';

import { Colors, Radius, Spacing } from '@/theme';

const beanIcon = require('../../../assets/bean.png');

const QUICK_AMOUNTS = [100_000, 200_000, 500_000, 1_000_000];

function parseBeansInput(raw: string): number {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return 0;
  return Math.min(Number(digits), Number.MAX_SAFE_INTEGER);
}

function snapToStep(amount: number): number {
  if (amount <= 0) return 0;
  return Math.floor(amount / WITHDRAWAL_BEAN_STEP) * WITHDRAWAL_BEAN_STEP;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onConfirm: (beans: number) => void;
  availableBeans: number;
  minBeans: number;
  currencySymbol: string;
  currencyCode: string;
  usdRate: number;
  initialBeans?: number;
  submitting?: boolean;
};

export function WithdrawAmountOverlay({
  visible,
  onClose,
  onConfirm,
  availableBeans,
  minBeans,
  currencySymbol,
  currencyCode,
  usdRate,
  initialBeans = 0,
  submitting = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const [beansInput, setBeansInput] = useState('');

  const effectiveMin = Math.max(WITHDRAWAL_MIN_BEANS, minBeans);

  useEffect(() => {
    if (!visible) return;
    const seed =
      initialBeans > 0
        ? initialBeans
        : availableBeans >= effectiveMin
          ? effectiveMin
          : 0;
    setBeansInput(seed > 0 ? String(seed) : '');
  }, [visible, initialBeans, availableBeans, effectiveMin]);

  const beans = useMemo(() => parseBeansInput(beansInput), [beansInput]);

  const localAmount = useMemo(
    () => ((beans / 10000) * usdRate).toFixed(2),
    [beans, usdRate],
  );

  const validationError = useMemo(() => {
    if (!beansInput.trim()) return 'Enter an amount to withdraw';
    if (beans < effectiveMin) {
      return `Minimum withdrawal is ${effectiveMin.toLocaleString()} beans`;
    }
    if (beans % WITHDRAWAL_BEAN_STEP !== 0) {
      return `Amount must be in multiples of ${WITHDRAWAL_BEAN_STEP} beans`;
    }
    if (beans > availableBeans) {
      return `You only have ${availableBeans.toLocaleString()} beans available`;
    }
    return null;
  }, [beansInput, beans, effectiveMin, availableBeans]);

  const canConfirm = !validationError && beans > 0 && !submitting;

  const handleMax = useCallback(() => {
    const capped = Math.min(availableBeans, WITHDRAWAL_DAILY_LIMIT_BEANS);
    setBeansInput(String(snapToStep(capped)));
  }, [availableBeans]);

  const applyQuick = useCallback(
    (amount: number) => {
      const capped = Math.min(amount, availableBeans);
      setBeansInput(String(snapToStep(capped)));
    },
    [availableBeans],
  );

  const handleConfirm = useCallback(() => {
    if (!canConfirm) return;
    onConfirm(beans);
  }, [canConfirm, beans, onConfirm]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.flex}>
        <Pressable style={styles.overlay} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Withdrawal amount</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} disabled={submitting}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.availableLabel}>Available beans</Text>
          <View style={styles.availableRow}>
            <Image source={beanIcon} style={styles.beanIcon} contentFit="contain" />
            <Text style={styles.availableValue}>{availableBeans.toLocaleString()}</Text>
            <TouchableOpacity style={styles.maxBtn} onPress={handleMax} disabled={availableBeans <= 0}>
              <Text style={styles.maxBtnText}>Max</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.inputLabel}>Beans to withdraw</Text>
          <View style={[styles.inputShell, validationError && beansInput.length > 0 && styles.inputShellError]}>
            <Image source={beanIcon} style={styles.inputBean} contentFit="contain" />
            <TextInput
              style={styles.input}
              value={beansInput}
              onChangeText={setBeansInput}
              placeholder="0"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="number-pad"
              editable={!submitting}
              selectTextOnFocus
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            {QUICK_AMOUNTS.map((amt) => (
              <TouchableOpacity
                key={amt}
                style={[styles.chip, beans === amt && styles.chipActive]}
                onPress={() => applyQuick(amt)}
                disabled={amt > availableBeans || submitting}
              >
                <Text style={[styles.chipText, beans === amt && styles.chipTextActive]}>
                  {amt >= 1_000_000 ? `${amt / 1_000_000}M` : `${amt / 1000}k`}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {validationError ? (
            <Text style={styles.errorText}>{validationError}</Text>
          ) : (
            <Text style={styles.hintText}>
              Min {effectiveMin.toLocaleString()} beans · Daily limit{' '}
              {WITHDRAWAL_DAILY_LIMIT_BEANS.toLocaleString()} beans · Multiples of{' '}
              {WITHDRAWAL_BEAN_STEP} · Approx. {currencySymbol}
              {localAmount} {currencyCode}
            </Text>
          )}

          <View style={styles.previewCard}>
            <Text style={styles.previewLabel}>Estimated payout</Text>
            <Text style={styles.previewAmount}>
              {currencySymbol}
              {beans > 0 ? localAmount : '0.00'}
            </Text>
            <Text style={styles.previewSub}>
              {beans > 0 ? `${beans.toLocaleString()} beans` : 'Enter amount above'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!canConfirm}
            activeOpacity={0.85}
          >
            <Text style={styles.confirmBtnText}>{submitting ? 'Submitting…' : 'Continue'}</Text>
          </TouchableOpacity>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  availableLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  availableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  beanIcon: {
    width: 22,
    height: 22,
  },
  availableValue: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  maxBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  maxBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  inputShellError: {
    borderColor: Colors.danger,
  },
  inputBean: {
    width: 20,
    height: 20,
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  chipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySubtle,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.primary,
  },
  errorText: {
    fontSize: 12,
    color: Colors.danger,
    marginBottom: Spacing.md,
  },
  hintText: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginBottom: Spacing.md,
  },
  previewCard: {
    backgroundColor: Colors.primarySubtle,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  previewLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  previewAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.primary,
  },
  previewSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  confirmBtn: {
    height: 52,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDisabled: {
    opacity: 0.45,
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
