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
import { useFocusEffect } from '@react-navigation/native';
import { useDispatch } from 'react-redux';
import { setWalletBalance as syncWalletToStore } from '@store/walletSlice';
import type { AppDispatch } from '@store/index';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';

import { WalletSkeleton } from '@components/Skeleton';
import { CountryCurrencyPicker } from '@components/payments/CountryCurrencyPicker';
import { WithdrawAmountOverlay } from '@components/payments/WithdrawAmountOverlay';
import { authApi } from '@api/auth';
import { paymentsApi } from '@api/payments';
import { walletApi } from '@api/wallet';

import { Colors, Radius, Spacing } from '@/theme';
import type { CurrencyConfig, UserPaymentMethod, WalletBalance } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';

const coinIcon = require('../../../assets/coin.png');

type Props = RootStackScreenProps<'Withdraw'>;

export function WithdrawScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch<AppDispatch>();

  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [currency, setCurrency] = useState<CurrencyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [amountOverlayOpen, setAmountOverlayOpen] = useState(false);
  const [withdrawBeans, setWithdrawBeans] = useState(0);
  const [paymentMethods, setPaymentMethods] = useState<UserPaymentMethod[]>([]);

  const loadScreenData = useCallback(async () => {
    setLoading(true);
    try {
      const [balResult, meResult, methodsResult] = await Promise.allSettled([
        walletApi.getBalance(),
        authApi.getMe(),
        paymentsApi.getPaymentMethods(),
      ]);

      if (balResult.status === 'fulfilled') {
        setBalance(balResult.value);
        dispatch(syncWalletToStore(balResult.value));
      }

      if (methodsResult.status === 'fulfilled') {
        setPaymentMethods(methodsResult.value);
      } else {
        setPaymentMethods([]);
      }

      const preferred =
        meResult.status === 'fulfilled'
          ? (meResult.value as { preferredWithdrawalCountryCode?: string })
              .preferredWithdrawalCountryCode
          : undefined;
      const cur = await paymentsApi.getMyCurrency(preferred || undefined);
      setCurrency(cur);
    } catch {
      /* non-blocking */
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  useFocusEffect(
    useCallback(() => {
      loadScreenData();
    }, [loadScreenData]),
  );

  const handleSelectCountry = useCallback(async (item: {
    countryCode: string;
    countryName: string;
    currency: string;
    symbol: string;
    usdRate: number;
    minWithdrawalBeans?: number;
  }) => {
    const rate = item.usdRate;
    setCurrency({
      id: item.countryCode,
      country_code: item.countryCode,
      country_name: item.countryName,
      currency_code: item.currency,
      currency_symbol: item.symbol,
      beans_to_currency_rate: String(rate),
      min_withdrawal_beans: item.minWithdrawalBeans ?? 10000,
    });
    try {
      await paymentsApi.setPreferredWithdrawalCountry(item.countryCode);
    } catch {
      /* non-blocking */
    }
  }, []);

  const available = Number(balance?.beanBalance ?? 0);
  const minBeans = currency?.min_withdrawal_beans ?? 10000;
  const rate = Number(currency?.beans_to_currency_rate ?? 1);
  const symbol = currency?.currency_symbol ?? '$';
  const code = currency?.currency_code ?? 'USD';
  const countryCode = currency?.country_code ?? '';

  const countryPaymentMethods = useMemo(
    () =>
      paymentMethods.filter(
        (m) => (m.country_code ?? '').toUpperCase() === countryCode.toUpperCase(),
      ),
    [paymentMethods, countryCode],
  );

  const defaultCountryMethod = useMemo(() => {
    if (countryPaymentMethods.length === 0) return null;
    return countryPaymentMethods.find((m) => m.is_default) ?? countryPaymentMethods[0];
  }, [countryPaymentMethods]);

  const hasCountryPaymentMethod = countryPaymentMethods.length > 0;

  const displayBeans = withdrawBeans > 0 ? withdrawBeans : 0;
  const localAmount = ((displayBeans / 10000) * rate).toFixed(2);

  const canOpenWithdraw =
    !submitting &&
    countryCode.length === 2 &&
    available >= minBeans &&
    hasCountryPaymentMethod;

  const submitWithdrawal = useCallback(
    async (beans: number) => {
      const payoutLocal = ((beans / 10000) * rate).toFixed(2);
      setAmountOverlayOpen(false);
      Alert.alert(
        'Confirm Withdrawal',
        `Withdraw ${beans.toLocaleString()} beans (${code} ${payoutLocal})?\n\nYour request will be reviewed within 3–5 business days.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm',
            onPress: async () => {
              setSubmitting(true);
              try {
                const methodId = defaultCountryMethod?.id;
                if (!methodId) {
                  Alert.alert('Payment method required', 'Bind a payout method first.');
                  return;
                }
                await walletApi.withdraw(beans, '', countryCode, methodId);
                setWithdrawBeans(0);
                Alert.alert(
                  'Submitted',
                  'Your withdrawal request has been submitted and is pending admin review.',
                );
                const bal = await walletApi.getBalance();
                setBalance(bal);
                dispatch(syncWalletToStore(bal));
              } catch (e: unknown) {
                Alert.alert('Error', e instanceof Error ? e.message : 'Please try again');
              } finally {
                setSubmitting(false);
              }
            },
          },
        ],
      );
    },
    [countryCode, code, rate, dispatch, defaultCountryMethod],
  );

  const handleWithdrawPress = useCallback(() => {
    if (!countryCode) {
      Alert.alert('Select country', 'Choose a payout country and currency first.');
      return;
    }
    if (!hasCountryPaymentMethod) {
      Alert.alert(
        'Payment method required',
        'Bind a payout method for this country before withdrawing.',
      );
      return;
    }
    if (available < minBeans) {
      Alert.alert(
        'Insufficient balance',
        `You need at least ${minBeans.toLocaleString()} beans to withdraw.`,
      );
      return;
    }
    setAmountOverlayOpen(true);
  }, [countryCode, hasCountryPaymentMethod, available, minBeans]);

  const handleAmountConfirm = useCallback(
    (beans: number) => {
      setWithdrawBeans(beans);
      submitWithdrawal(beans);
    },
    [submitWithdrawal],
  );

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <WalletSkeleton />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Withdraw</Text>
        <TouchableOpacity onPress={() => navigation.navigate('WithdrawalHistory')}>
          <Text style={styles.recordLink}>Record</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAwareScroll
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      >
        {/* Scam Prevention Alert */}
        <TouchableOpacity style={styles.scamAlert} activeOpacity={0.7}>
          <Ionicons name="notifications" size={16} color="#E8A020" />
          <Text style={styles.scamText}>Scam Prevention Alert</Text>
          <Ionicons name="chevron-forward" size={16} color="#E8A020" />
        </TouchableOpacity>

        {/* Purple withdraw card */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handleWithdrawPress}
          disabled={!countryCode || available < minBeans}
        >
        <LinearGradient
          colors={['#7B4FFF', '#5B2FD4']}
          style={styles.withdrawCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          {/* Watermark */}
          <Text style={styles.watermark}>HAKA</Text>

          {/* Top row: label + eye icon */}
          <View style={styles.withdrawCardRow}>
            <Text style={styles.withdrawLabel}>Withdrawal Amount</Text>
            <TouchableOpacity hitSlop={8}>
              <Ionicons name="eye" size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>

          {/* Amount */}
          <Text style={styles.withdrawAmount}>
            {symbol}{displayBeans > 0 ? localAmount : '0.00'}
          </Text>
          <Text style={styles.withdrawBeansHint}>
            {displayBeans > 0
              ? `${displayBeans.toLocaleString()} beans`
              : available >= minBeans
                ? 'Tap to enter withdrawal amount'
                : `Min ${minBeans.toLocaleString()} beans required`}
          </Text>

          {/* Bottom stats */}
          <View style={styles.withdrawCardBottom}>
            <View style={styles.withdrawStat}>
              <Text style={styles.withdrawStatLabel}>Total Amount</Text>
              <Text style={styles.withdrawStatValue}>
                {symbol}{((available / 10000) * Number(rate)).toFixed(2)}
              </Text>
            </View>
            <View style={styles.withdrawStat}>
              <View style={styles.unconfirmedRow}>
                <Text style={styles.withdrawStatLabel}>Unconfirmed</Text>
                <Ionicons name="help-circle-outline" size={12} color="rgba(255,255,255,0.5)" />
              </View>
              <View style={styles.unconfirmedValueRow}>
                <Image source={coinIcon} style={styles.coinIconSmall} />
                <Text style={styles.withdrawStatValue}>0</Text>
              </View>
            </View>
          </View>
        </LinearGradient>
        </TouchableOpacity>

        {/* Payout country */}
        <View style={styles.section}>
          <Text style={styles.methodLabel}>Payout country & currency</Text>
          <TouchableOpacity
            style={styles.methodRow}
            onPress={() => setPickerOpen(true)}
          >
            <Text style={styles.methodText}>
              {currency
                ? `${currency.country_name} (${currency.currency_code})`
                : 'Select country'}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#333" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.methodLabel}>Payment method</Text>
          <TouchableOpacity
            style={styles.methodRow}
            onPress={() => {
              if (!currency) {
                Alert.alert('Select country', 'Choose a payout country first.');
                return;
              }
              navigation.navigate('BindPaymentMethod', {
                countryCode: currency.country_code,
                currency: currency.currency_code,
                countryName: currency.country_name,
              });
            }}
          >
            <Text style={styles.methodText} numberOfLines={2}>
              {defaultCountryMethod
                ? `${defaultCountryMethod.label ?? defaultCountryMethod.provider} · ${defaultCountryMethod.masked_account}`
                : countryCode
                  ? 'Add a payment method'
                  : 'Select country first'}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#333" />
          </TouchableOpacity>
          {countryCode && !hasCountryPaymentMethod ? (
            <Text style={styles.methodHint}>
              Bind a payout method for {currency?.country_name ?? countryCode} to withdraw.
            </Text>
          ) : null}
        </View>

        {/* Withdraw button */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.withdrawBtn, !canOpenWithdraw && styles.withdrawBtnDisabled]}
            onPress={handleWithdrawPress}
            disabled={!canOpenWithdraw}
          >
            <Text style={styles.withdrawBtnText}>Withdraw now</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.exchangeBtn}
            onPress={() => navigation.navigate('ExchangeCoin')}
          >
            <Text style={styles.exchangeBtnText}>Exchange Points for Coins</Text>
          </TouchableOpacity>
        </View>

        {/* Withdrawal Rules */}
        <View style={styles.rulesSection}>
          <Text style={styles.rulesTitle}>Withdrawal Rules</Text>

          <View style={styles.rulesTable}>
            <View style={styles.rulesRow}>
              <Text style={styles.rulesLabel}>Exchange ratio</Text>
              <View style={styles.rulesValueRow}>
                <Image source={coinIcon} style={styles.rulesCoinIcon} />
                <Text style={styles.rulesValue}>
                  10,000  = {symbol}{Number(rate).toFixed(2)}
                </Text>
              </View>
            </View>
            <View style={styles.rulesDivider} />
            <View style={styles.rulesRow}>
              <Text style={styles.rulesLabel}>Minimum withdrawal amount</Text>
              <View style={styles.rulesValueRow}>
                <Image source={coinIcon} style={styles.rulesCoinIcon} />
                <Text style={styles.rulesValue}>
                  {minBeans.toLocaleString()}  = {symbol}{((minBeans / 10000) * Number(rate)).toFixed(2)}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.rulesNote}>
            1. Coins can not be withdrawn.
          </Text>
          <Text style={styles.rulesNote}>
            2. The service fees for different payment methods may vary. Please choose a suitable payment method.
          </Text>
        </View>
      </KeyboardAwareScroll>

      <CountryCurrencyPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelectCountry}
        selectedCountryCode={currency?.country_code}
        title="Payout country"
        withdrawalOnly
      />

      <WithdrawAmountOverlay
        visible={amountOverlayOpen}
        onClose={() => setAmountOverlayOpen(false)}
        onConfirm={handleAmountConfirm}
        availableBeans={available}
        minBeans={minBeans}
        currencySymbol={symbol}
        currencyCode={code}
        usdRate={rate}
        initialBeans={withdrawBeans}
        submitting={submitting}
      />
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
  recordLink: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.primary,
  },

  // Scam alert
  scamAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: 'rgba(232,160,32,0.08)',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  scamText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#E8A020',
  },

  // Withdraw card
  withdrawCard: {
    marginHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
  },
  watermark: {
    position: 'absolute',
    fontSize: 60,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.08)',
    top: '30%',
    left: '25%',
    transform: [{ rotate: '-15deg' }],
  },
  withdrawCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  withdrawLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  withdrawAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFF',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  withdrawBeansHint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: Spacing.lg,
  },
  withdrawCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  withdrawStat: {
    gap: Spacing.xs,
  },
  withdrawStatLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  withdrawStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  unconfirmedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  unconfirmedValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  coinIconSmall: {
    width: 18,
    height: 18,
  },

  // Section
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  // Method section
  methodLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginBottom: Spacing.sm,
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8F8F8',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  methodText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    marginRight: Spacing.sm,
  },
  methodHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },

  // Buttons
  withdrawBtn: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  withdrawBtnDisabled: {
    opacity: 0.45,
  },
  withdrawBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
  exchangeBtn: {
    height: 44,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  exchangeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },

  // Rules
  rulesSection: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
  rulesTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: Spacing.md,
  },
  rulesTable: {
    backgroundColor: '#F8F8F8',
    borderRadius: Radius.md,
    padding: Spacing.lg,
  },
  rulesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  rulesLabel: {
    fontSize: 13,
    color: '#666',
  },
  rulesValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  rulesCoinIcon: {
    width: 16,
    height: 16,
  },
  rulesValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  rulesDivider: {
    height: 1,
    backgroundColor: '#EBEBEB',
  },
  rulesNote: {
    fontSize: 11,
    color: '#999',
    marginTop: Spacing.sm,
    lineHeight: 16,
  },
});
