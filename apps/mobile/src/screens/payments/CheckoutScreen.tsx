/**
 * CheckoutScreen
 *
 * Initiates a Stripe PaymentSheet for the selected CoinPackage.
 * Requires @stripe/stripe-react-native — see setup instructions in README.
 *
 * Flow:
 *  1. POST /payments/checkout/ → receive client_secret + publishable_key
 *  2. initPaymentSheet(client_secret)
 *  3. presentPaymentSheet()
 *  4. On success → show confirmation (coins credited asynchronously via webhook)
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { paymentsApi } from '@api/payments';
import { Colors, Radius, Spacing } from '@/theme';
import type { CoinPackageLocal } from '@/types';

// Minimal shape until Stripe integration is wired up (Feature 11)
interface PaymentIntent { clientSecret: string; publishableKey: string; }
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'Checkout'>;

// Stripe is imported lazily so the app doesn't crash if the native module
// hasn't been linked yet (e.g. running without a custom dev build).
let StripeProvider: React.ComponentType<any> | null = null;
let useStripe: (() => any) | null = null;
try {
  const stripe = require('@stripe/stripe-react-native');
  StripeProvider = stripe.StripeProvider;
  useStripe = stripe.useStripe;
} catch {
  // @stripe/stripe-react-native not linked — UI shows "setup required" message
}

export function CheckoutScreen({ navigation, route }: Props) {
  const { packageId } = route.params;
  const insets = useSafeAreaInsets();

  const [pkg, setPkg]                   = useState<CoinPackageLocal | null>(null);
  const [intent, setIntent]             = useState<PaymentIntent | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(true);
  const [processing, setProcessing]     = useState(false);

  // Load the package details from the cached package list for display
  useEffect(() => {
    paymentsApi.getPackages().then((pkgs) => {
      setPkg(pkgs.find((p) => p.id === packageId) ?? null);
    }).catch(() => {});
  }, [packageId]);

  // Create the PaymentIntent on mount (Feature 11 — Stripe integration)
  useEffect(() => {
    // TODO: wire up Stripe createPaymentIntent endpoint in Feature 11
    setLoadingIntent(false);
  }, [packageId]);

  if (!StripeProvider || !useStripe) {
    return <StripeNotConfigured onBack={() => navigation.goBack()} />;
  }

  return (
    <StripeProvider publishableKey={intent?.publishableKey ?? ''}>
      <CheckoutInner
        pkg={pkg}
        intent={intent}
        loadingIntent={loadingIntent}
        processing={processing}
        setProcessing={setProcessing}
        navigation={navigation}
        insets={insets}
      />
    </StripeProvider>
  );
}

function CheckoutInner({
  pkg,
  intent,
  loadingIntent,
  processing,
  setProcessing,
  navigation,
  insets,
}: {
  pkg: CoinPackageLocal | null;
  intent: PaymentIntent | null;
  loadingIntent: boolean;
  processing: boolean;
  setProcessing: (v: boolean) => void;
  navigation: any;
  insets: any;
}) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe!();
  const [sheetReady, setSheetReady] = useState(false);

  useEffect(() => {
    if (!intent) return;
    initPaymentSheet({
      paymentIntentClientSecret: intent.clientSecret,
      merchantDisplayName: 'Haka Live',
      applePay: { merchantCountryCode: 'GB' },
      googlePay: { merchantCountryCode: 'GB', testEnv: true },
      style: 'alwaysDark',
    }).then(({ error }: { error?: { code: string; message: string } }) => {
      if (!error) setSheetReady(true);
    });
  }, [intent, initPaymentSheet]);

  const handlePay = useCallback(async () => {
    setProcessing(true);
    const { error } = await presentPaymentSheet();
    setProcessing(false);
    if (error) {
      if (error.code !== 'Canceled') {
        Alert.alert('Payment failed', error.message);
      }
    } else {
      // Payment succeeded — coins credited asynchronously via webhook
      Alert.alert(
        'Payment Successful! 🎉',
        `Your coins are being added to your wallet. This may take a few seconds.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    }
  }, [presentPaymentSheet, setProcessing, navigation]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        {/* Package summary */}
        {pkg && (
          <View style={styles.packageCard}>
            <View style={styles.coinRow}>
              <Ionicons name="logo-bitcoin" size={40} color={Colors.coin} />
              <View>
                <Text style={styles.packageCoins}>{pkg.total_coins.toLocaleString()} coins</Text>
                {pkg.bonus_coins > 0 && (
                  <Text style={styles.packageBonus}>Includes {pkg.bonus_coins.toLocaleString()} bonus coins</Text>
                )}
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Total</Text>
              <Text style={styles.priceValue}>{pkg.currency_symbol}{pkg.price_local}</Text>
            </View>
          </View>
        )}

        {/* Payment method icons */}
        <View style={styles.methodRow}>
          <Ionicons name="card" size={24} color={Colors.textTertiary} />
          <Text style={styles.methodText}> Apple Pay  Google Pay  Card</Text>
        </View>

        <Text style={styles.secureNote}>
          <Ionicons name="lock-closed" size={12} color={Colors.success} />
          {' '}Secured by Stripe
        </Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <TouchableOpacity
            disabled={loadingIntent || !sheetReady || processing}
            onPress={handlePay}
          >
            <LinearGradient
              colors={['#7B4FFF', '#4A1FCC']}
              style={[styles.payBtn, (loadingIntent || !sheetReady || processing) && { opacity: 0.5 }]}
            >
              <>
                  <Ionicons name="card" size={18} color="#FFFFFF" />
                  <Text style={styles.payBtnText}>Pay {pkg?.currency_symbol ?? '$'}{pkg?.price_local ?? '—'}</Text>
                </>
            </LinearGradient>
          </TouchableOpacity>
      </View>
    </View>
  );
}

function StripeNotConfigured({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.center}>
        <Ionicons name="construct-outline" size={48} color={Colors.warning} />
        <Text style={styles.setupTitle}>Stripe not configured</Text>
        <Text style={styles.setupText}>
          Run the setup steps in CLAUDE.md to link{'\n'}@stripe/stripe-react-native.
        </Text>
      </View>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl },
  body: { flex: 1, padding: Spacing.lg, gap: Spacing.lg },

  packageCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.md,
  },
  coinRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  packageCoins: { color: Colors.textPrimary, fontSize: 22, fontWeight: '800' },
  packageBonus: { color: Colors.gold, fontSize: 13, fontWeight: '600', marginTop: 2 },
  divider:      { height: 1, backgroundColor: Colors.border },
  priceRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceLabel:   { color: Colors.textSecondary, fontSize: 15 },
  priceValue:   { color: Colors.textPrimary, fontSize: 22, fontWeight: '800' },

  methodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  methodText: { color: Colors.textTertiary, fontSize: 13 },
  secureNote: { color: Colors.textTertiary, fontSize: 12, textAlign: 'center' },

  footer: {
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  payBtn: {
    height: 56, borderRadius: Radius.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
  },
  payBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },

  setupTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  setupText:  { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
