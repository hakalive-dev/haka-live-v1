import React, { useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';

import { paymentsApi } from '@api/payments';
import { queryKeys } from '@api/queryKeys';
import type { CountryCurrency } from '@api/payments';
import { CountryCurrencyPicker } from '@components/payments/CountryCurrencyPicker';
import { Colors, Radius, Spacing } from '@/theme';
import { WalletSkeleton } from '@components/Skeleton';
import type { CoinPackageLocal } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'Shop'>;

const COINS_PER_USD = 10_000;

const isPopular  = (pkg: CoinPackageLocal) => pkg.bonus_coins > 0 && pkg.bonus_coins / pkg.coins >= 0.15;
const isBestValue = (pkg: CoinPackageLocal) => pkg.bonus_coins > 0 && pkg.bonus_coins / pkg.coins >= 0.25;

export function ShopScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [currency, setCurrency]         = useState('USD');
  const [pickerVisible, setPickerVisible] = useState(false);

  // Currencies + coin packages change rarely — cache them so reopening the shop
  // (or flipping currency back) paints instantly instead of re-fetching.
  const currenciesQuery = useQuery({
    queryKey: queryKeys.payments.currencies(),
    queryFn: () => paymentsApi.getCurrencies(),
    staleTime: 600_000,
  });
  const packagesQuery = useQuery({
    queryKey: queryKeys.payments.packages(currency),
    queryFn: () => paymentsApi.getPackages(currency),
    staleTime: 300_000,
    placeholderData: keepPreviousData,
  });

  const currencies: CountryCurrency[] = currenciesQuery.data ?? [];
  const packages: CoinPackageLocal[] = packagesQuery.data ?? [];
  const loading = packages.length === 0 && packagesQuery.isLoading;
  const error = packagesQuery.isError;

  const selectedCurrency = currencies.find((c) => c.currency === currency);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Top Up Coins</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('PaymentHistory')}
          hitSlop={8}
          style={styles.historyBtn}
        >
          <Ionicons name="receipt-outline" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Rate + currency selector */}
      <View style={styles.rateRow}>
        <View style={styles.rateInfo}>
          <Ionicons name="information-circle-outline" size={14} color={Colors.textTertiary} />
          <Text style={styles.rateText}>10,000 coins = $1.00 · 1 bean = 1 coin</Text>
        </View>
        <TouchableOpacity style={styles.currencyPicker} onPress={() => setPickerVisible(true)}>
          <Text style={styles.currencyCode}>{selectedCurrency?.symbol ?? '$'} {currency}</Text>
          <Ionicons name="chevron-down" size={14} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <WalletSkeleton />
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={Colors.danger} />
          <Text style={styles.errorText}>Failed to load packages</Text>
        </View>
      ) : (
        <FlatList
          data={packages}
          keyExtractor={(p) => p.id}
          numColumns={2}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + Spacing.lg }]}
          columnWrapperStyle={styles.row}
          ListHeaderComponent={<FreeTopUpBanner onPress={() => navigation.navigate('PaymentHistory')} />}
          renderItem={({ item }) => (
            <PackageCard
              pkg={item}
              onPress={() => navigation.navigate('Checkout', { packageId: item.id })}
            />
          )}
        />
      )}

      <CountryCurrencyPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        title="Select country & currency"
        onSelect={(item) => {
          setCurrency(item.currency);
          setPickerVisible(false);
        }}
      />
    </View>
  );
}

function FreeTopUpBanner({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.freeBanner} onPress={onPress} activeOpacity={0.8}>
      <LinearGradient colors={[Colors.goldSubtle, 'transparent']} style={styles.freeBannerGradient}>
        <Ionicons name="gift-outline" size={20} color={Colors.gold} />
        <View style={styles.freeBannerText}>
          <Text style={styles.freeBannerTitle}>Free Welcome Top-Up</Text>
          <Text style={styles.freeBannerSub}>Claim 100 free coins — one time only</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.gold} />
      </LinearGradient>
    </TouchableOpacity>
  );
}

function PackageCard({ pkg, onPress }: { pkg: CoinPackageLocal; onPress: () => void }) {
  const best    = isBestValue(pkg);
  const popular = isPopular(pkg);
  const priceNum = Number(pkg.price_local);
  const priceDisplay = isNaN(priceNum) ? pkg.price_local : priceNum.toFixed(2);
  const usdEquiv = (pkg.total_coins / COINS_PER_USD).toFixed(2);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {best && (
        <LinearGradient colors={['#FFD700', '#B8860B']} style={styles.cardBadge}>
          <Text style={styles.cardBadgeText}>BEST VALUE</Text>
        </LinearGradient>
      )}
      {!best && popular && (
        <View style={[styles.cardBadge, { backgroundColor: Colors.primary }]}>
          <Text style={styles.cardBadgeText}>POPULAR</Text>
        </View>
      )}

      <View style={styles.coinIcon}>
        <Ionicons name="logo-bitcoin" size={32} color={Colors.coin} />
      </View>

      <Text style={styles.totalCoins}>{pkg.total_coins.toLocaleString()}</Text>
      <Text style={styles.coinLabel}>coins</Text>

      {pkg.bonus_coins > 0 && (
        <View style={styles.bonusPill}>
          <Text style={styles.bonusText}>+{pkg.bonus_coins.toLocaleString()} bonus</Text>
        </View>
      )}

      <LinearGradient colors={['#7B4FFF', '#4A1FCC']} style={styles.priceBtn}>
        <Text style={styles.priceText}>{pkg.currency_symbol}{priceDisplay}</Text>
      </LinearGradient>
      <Text style={styles.usdNote}>(≈ ${usdEquiv} USD)</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  historyBtn:  { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, color: Colors.textPrimary, fontSize: 17, fontWeight: '700', textAlign: 'center' },

  rateRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  rateInfo:   { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  rateText:   { color: Colors.textTertiary, fontSize: 11 },
  currencyPicker: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primarySubtle, borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 4,
  },
  currencyCode: { color: Colors.primary, fontSize: 13, fontWeight: '700' },

  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  errorText: { color: Colors.textSecondary, fontSize: 14 },

  grid: { padding: Spacing.lg, gap: Spacing.md },
  row:  { gap: Spacing.md },

  freeBanner:         { marginBottom: Spacing.md, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.gold + '44' },
  freeBannerGradient: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  freeBannerText:     { flex: 1 },
  freeBannerTitle:    { color: Colors.gold, fontSize: 14, fontWeight: '700' },
  freeBannerSub:      { color: Colors.textTertiary, fontSize: 12, marginTop: 2 },

  card: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, alignItems: 'center', gap: Spacing.sm,
    overflow: 'hidden',
  },
  cardBadge: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingVertical: 4, alignItems: 'center',
  },
  cardBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  coinIcon:   { marginTop: Spacing.lg },
  totalCoins: { color: Colors.textPrimary, fontSize: 22, fontWeight: '800' },
  coinLabel:  { color: Colors.textTertiary, fontSize: 12, marginTop: -4 },
  bonusPill: {
    backgroundColor: Colors.goldSubtle, borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
  },
  bonusText: { color: Colors.gold, fontSize: 11, fontWeight: '700' },
  priceBtn: {
    width: '100%', height: 40, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center', marginTop: Spacing.xs,
  },
  priceText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  usdNote:   { color: Colors.textTertiary, fontSize: 10, marginTop: -4 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.surfaceElevated, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '70%', paddingBottom: Spacing.xxxl,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '700' },
  currencyOption: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  currencyOptionActive:  { backgroundColor: Colors.primarySubtle },
  currencyOptionSymbol:  { color: Colors.textSecondary, fontSize: 16, width: 28, textAlign: 'center' },
  currencyOptionCode:    { color: Colors.textPrimary, fontSize: 15, fontWeight: '600', flex: 1 },
  currencyCheck:         { marginLeft: 'auto' },
});
