import React, { useCallback, useEffect, useState } from 'react';
import RazorpayCheckout from 'react-native-razorpay';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { walletApi } from '@api/wallet';
import { paymentsApi } from '@api/payments';
import type { CountryCurrency } from '@api/payments';
import { Colors, Radius, Spacing } from '@/theme';
import { WalletSkeleton } from '@components/Skeleton';
import { CopyableId } from '@components/CopyableId';
import { UserAvatar } from '@components/UserAvatar';
import type { CoinPackageLocal, CoinSeller, WalletBalance } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';
import UpiIcon from '../../../assets/payment-methods/upi.svg';
import EpayIcon from '../../../assets/payment-methods/epay.svg';
import UsdtIcon from '../../../assets/payment-methods/usdt.svg';
import UsdcIcon from '../../../assets/payment-methods/usdc.svg';

type Props = RootStackScreenProps<'TopUp'>;

const SELLER_TAB = 'Coin Sellers' as const;
const DIRECT_TABS = ['Recharge', 'Google Pay'] as const;
type DirectTab = (typeof DIRECT_TABS)[number];
type TopUpTab = DirectTab | typeof SELLER_TAB;

const FALLBACK_CURRENCIES: CountryCurrency[] = [
  { countryCode: 'IN', countryName: 'India',          currency: 'INR', symbol: '₹',  usdRate: 83,    isActive: true },
  { countryCode: 'US', countryName: 'United States',  currency: 'USD', symbol: '$',  usdRate: 1,     isActive: true },
  { countryCode: 'GB', countryName: 'United Kingdom', currency: 'GBP', symbol: '£',  usdRate: 0.78,  isActive: true },
  { countryCode: 'PH', countryName: 'Philippines',    currency: 'PHP', symbol: '₱',  usdRate: 56,    isActive: true },
  { countryCode: 'ID', countryName: 'Indonesia',      currency: 'IDR', symbol: 'Rp', usdRate: 15800, isActive: true },
];

function formatLocal(usd: number, meta: CountryCurrency): string {
  const v = usd * meta.usdRate;
  if (meta.currency === 'IDR') return `${meta.symbol}${Math.round(v).toLocaleString()}`;
  if (meta.currency === 'USD' || meta.currency === 'GBP') return `${meta.symbol}${v.toFixed(2)}`;
  return `${meta.symbol}${Math.round(v).toLocaleString()}`;
}

const METHODS = [
  { id: 'upi',  label: 'UPI',  sub: '',            Icon: UpiIcon  },
  { id: 'epay', label: 'Epay', sub: '',            Icon: EpayIcon },
  { id: 'usdt', label: 'USDT', sub: 'Crypto coin', Icon: UsdtIcon },
  { id: 'usdc', label: 'USDC', sub: 'Crypto coin', Icon: UsdcIcon },
] as const;

const METHOD_ICONS: Record<string, React.ComponentType<{ width?: number; height?: number }>> = {
  upi: UpiIcon, epay: EpayIcon, usdt: UsdtIcon, usdc: UsdcIcon,
};
type MethodId = (typeof METHODS)[number]['id'];

const COINS_PER_USD = 10_000;
const RECHARGE_PRESETS = [3, 6, 15, 30, 60, 150];
const GPAY_PRESETS = [3, 6, 15, 30, 60, 150, 300, 600, 1500, 3000, 6000, 15000];

function coinsForUsd(usd: number) {
  return usd * COINS_PER_USD;
}

export function TopUpScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [directTopupEnabled, setDirectTopupEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<TopUpTab>(SELLER_TAB);
  const [country, setCountry] = useState<string>('India');
  const [countryOpen, setCountryOpen] = useState(false);
  const [method, setMethod] = useState<MethodId>('upi');
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [coinSellers, setCoinSellers] = useState<CoinSeller[]>([]);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currencies, setCurrencies] = useState<CountryCurrency[]>(FALLBACK_CURRENCIES);
  const [packages, setPackages] = useState<CoinPackageLocal[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  const visibleTabs: TopUpTab[] = directTopupEnabled
    ? [...DIRECT_TABS, SELLER_TAB]
    : [SELLER_TAB];

  const countryMeta =
    currencies.find((c) => c.countryName === country) ??
    currencies.find((c) => c.countryCode === 'US') ??
    FALLBACK_CURRENCIES[1];

  const load = useCallback(async () => {
    try {
      const [configResult, balResult, sellersResult, currenciesResult, pkgResult] =
        await Promise.allSettled([
          paymentsApi.getConfig(),
          walletApi.getBalance(),
          paymentsApi.getCoinSellers(countryMeta.countryCode),
          paymentsApi.getCurrencies(),
          paymentsApi.getPackages(countryMeta.currency),
        ]);
      if (configResult.status === 'fulfilled') {
        const enabled = configResult.value.direct_user_topup_enabled;
        setDirectTopupEnabled(enabled);
        setActiveTab(enabled ? 'Recharge' : SELLER_TAB);
      }
      if (balResult.status === 'fulfilled') setBalance(balResult.value);
      if (sellersResult.status === 'fulfilled') setCoinSellers(sellersResult.value);
      if (currenciesResult.status === 'fulfilled' && currenciesResult.value.length > 0) {
        setCurrencies(currenciesResult.value);
      }
      if (pkgResult.status === 'fulfilled' && pkgResult.value.length > 0) {
        setPackages(pkgResult.value);
        setSelectedPackageId(pkgResult.value[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [countryMeta.countryCode]);

  useEffect(() => { load(); }, [load]);

  const presets = activeTab === 'Google Pay' ? GPAY_PRESETS : RECHARGE_PRESETS;

  const handleTopUp = useCallback(async () => {
    const usd = presets[selectedIdx] ?? presets[0];
    const coins = coinsForUsd(usd);
    setSubmitting(true);
    try {
      const result = await walletApi.topUp(coins);
      setBalance((prev) => prev ? { ...prev, coinBalance: result.coinBalance } : prev);
      Alert.alert('Success', `${result.coinsAdded.toLocaleString()} coins added to your wallet!`);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to top up. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [selectedIdx, presets]);

  const handleRazorpayPay = useCallback(async () => {
    if (!selectedPackageId) return;
    setSubmitting(true);
    try {
      const order = await paymentsApi.createRazorpayOrder(selectedPackageId);
      const options = {
        description: `${(order.coins + order.bonusCoins).toLocaleString()} Coins`,
        currency: 'INR',
        key: order.keyId,
        amount: order.amountPaise,
        order_id: order.orderId,
        name: 'Haka Live',
        prefill: {},
        theme: { color: '#7B4FFF' },
      };
      await RazorpayCheckout.open(options);
      Alert.alert(
        'Payment Submitted',
        'Your payment is being processed. Coins will appear in your wallet shortly.',
      );
    } catch (err: any) {
      if (err?.code !== 0) {
        Alert.alert('Payment Failed', err?.description ?? 'Payment was not completed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }, [selectedPackageId]);

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <WalletSkeleton />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Top-up coins</Text>
        <TouchableOpacity
          style={styles.countryBtn}
          onPress={() => setCountryOpen((v) => !v)}
          hitSlop={8}
        >
          <Text style={styles.countryText}>{country}</Text>
          <Ionicons name={countryOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#000" />
        </TouchableOpacity>
      </View>

      {countryOpen && (
        <View style={styles.countryMenu}>
          {currencies.map((row) => row.countryName).map((c) => (
            <TouchableOpacity
              key={c}
              style={styles.countryMenuItem}
              onPress={() => { setCountry(c); setCountryOpen(false); }}
            >
              <Text style={[styles.countryMenuText, c === country && styles.countryMenuTextActive]}>
                {c}
              </Text>
              {c === country && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      >
        <LinearGradient
          colors={['#F5C842', '#E8A020']}
          style={styles.balanceCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.balanceAmount}>
            {(balance?.coinBalance ?? 0).toLocaleString()}
          </Text>
          <Text style={styles.balanceLabel}>Remaining coins</Text>
          <TouchableOpacity
            style={styles.coinsDetailBtn}
            onPress={() => navigation.navigate('PaymentHistory')}
          >
            <Text style={styles.coinsDetailText}>Coins details</Text>
            <Ionicons name="chevron-forward" size={12} color="#000" />
          </TouchableOpacity>
          <Text style={styles.balanceTicker} numberOfLines={1}>
            [93****30]  08-25 14:45  $1.00 recharged  678899909
          </Text>
        </LinearGradient>

        {!directTopupEnabled && (
          <View style={styles.pauseBanner}>
            <Ionicons name="information-circle" size={20} color={Colors.primary} />
            <Text style={styles.pauseBannerText}>
              Direct recharge is temporarily unavailable. Contact a coin seller below to purchase coins.
            </Text>
          </View>
        )}

        <View style={styles.tabRow}>
          {visibleTabs.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={styles.tab}
              onPress={() => { setActiveTab(tab); setSelectedIdx(0); }}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab}
              </Text>
              {tab === SELLER_TAB && (
                <Ionicons
                  name="arrow-up-outline"
                  size={12}
                  color={activeTab === tab ? '#000' : '#999'}
                />
              )}
              {activeTab === tab && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>

        {directTopupEnabled && activeTab !== SELLER_TAB && (
          <View style={styles.tabContent}>
            {activeTab === 'Recharge' && (
              <View style={styles.methodGrid}>
                {METHODS.map((m) => {
                  const selected = method === m.id;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.methodTile, selected && styles.methodTileActive]}
                      onPress={() => setMethod(m.id)}
                      activeOpacity={0.7}
                    >
                      <m.Icon width={32} height={32} />
                      <View style={styles.methodText}>
                        <Text style={styles.methodLabel}>{m.label}</Text>
                        {m.sub ? <Text style={styles.methodSub}>{m.sub}</Text> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {activeTab === 'Recharge' && method === 'upi' ? (
              <>
                <View style={styles.amountGrid}>
                  {packages.map((pkg) => {
                    const selected = pkg.id === selectedPackageId;
                    return (
                      <TouchableOpacity
                        key={pkg.id}
                        style={[styles.amountTile, selected && styles.amountTileActive]}
                        onPress={() => setSelectedPackageId(pkg.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.amountCoins}>
                          {pkg.total_coins.toLocaleString()}
                        </Text>
                        <Text style={styles.amountPrice}>
                          {pkg.currency_symbol}{pkg.price_local}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity
                  style={[styles.payBtn, (submitting || !selectedPackageId) && styles.payBtnDisabled]}
                  onPress={handleRazorpayPay}
                  disabled={submitting || !selectedPackageId}
                  activeOpacity={0.8}
                >
                  <Text style={styles.payBtnText}>Pay via UPI</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.amountGrid}>
                  {presets.map((usd, i) => {
                    const coins = coinsForUsd(usd);
                    const selected = i === selectedIdx;
                    return (
                      <TouchableOpacity
                        key={usd}
                        style={[styles.amountTile, selected && styles.amountTileActive]}
                        onPress={() => setSelectedIdx(i)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.amountCoins}>{coins.toLocaleString()}</Text>
                        <Text style={styles.amountPrice}>{formatLocal(usd, countryMeta)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity
                  style={[styles.payBtn, submitting && styles.payBtnDisabled]}
                  onPress={handleTopUp}
                  disabled={submitting}
                  activeOpacity={0.8}
                >
                  <Text style={styles.payBtnText}>
                    Pay {formatLocal(presets[selectedIdx] ?? presets[0], countryMeta)}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {activeTab === SELLER_TAB && (
          <View style={styles.tabContent}>
            {coinSellers.length === 0 ? (
              <Text style={styles.emptyText}>No coin sellers available in your area.</Text>
            ) : (
              coinSellers.map((seller) => {
                const methods = seller.payment_methods ?? [];
                const price = seller.price_per_coin
                  ? formatLocal(seller.price_per_coin, countryMeta)
                  : 'Price';
                return (
                  <View key={seller.id} style={styles.sellerCard}>
                    <View style={styles.sellerAvatarWrap}>
                      <UserAvatar
                        user={{
                          displayName: seller.displayName,
                          avatar: seller.avatar,
                          equippedFrame: seller.equippedFrame ?? null,
                        }}
                        size={56}
                      />
                      <View style={styles.coinSellerRibbon}>
                        <Image
                          source={require('../../../assets/coin.png')}
                          style={styles.coinSellerRibbonIcon}
                        />
                        <Text style={styles.coinSellerRibbonText}>Coin Seller</Text>
                      </View>
                    </View>

                    <View style={styles.sellerMain}>
                      <Text style={styles.sellerName} numberOfLines={1}>
                        {seller.displayName.toUpperCase()}
                      </Text>
                      <CopyableId value={seller.activeSpecialId ?? seller.hakaId} textStyle={styles.sellerId} containerStyle={styles.sellerIdRow} iconColor="#999" iconSize={12} />
                      <View style={styles.methodIconRow}>
                        {methods.map((m) => {
                          const Icon = METHOD_ICONS[m];
                          return Icon ? (
                            <View key={m} style={styles.methodIconPill}>
                              <Icon width={22} height={14} />
                            </View>
                          ) : null;
                        })}
                      </View>
                    </View>

                    <View style={styles.sellerActions}>
                      <View style={styles.pricePill}>
                        <Text style={styles.pricePillText}>{price}</Text>
                      </View>
                      <View style={styles.sellerActionIcons}>
                        <TouchableOpacity
                          style={styles.chatCircle}
                          onPress={() =>
                            navigation.navigate('DMConversation', {
                              userId: seller.id,
                              displayName: seller.displayName,
                            })
                          }
                        >
                          <Ionicons name="chatbubble-ellipses" size={16} color="#FFF" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.whatsCircle}
                          onPress={() => {
                            const num = seller.whatsapp_number?.replace(/[^\d+]/g, '');
                            if (num) Linking.openURL(`https://wa.me/${num}`).catch(() => {});
                          }}
                        >
                          <Ionicons name="logo-whatsapp" size={16} color="#FFF" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        <TouchableOpacity style={styles.serviceLink}>
          <Text style={styles.serviceLinkText}>{'≫ Top up customer service ≪'}</Text>
        </TouchableOpacity>
      </ScrollView>
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
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  countryText: { fontSize: 13, fontWeight: '500', color: '#000' },
  countryMenu: {
    position: 'absolute',
    top: 56,
    right: Spacing.lg,
    backgroundColor: '#FFF',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#EEE',
    paddingVertical: 4,
    minWidth: 180,
    zIndex: 20,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
  },
  countryMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  countryMenuText: { fontSize: 13, color: '#333' },
  countryMenuTextActive: { color: Colors.primary, fontWeight: '600' },

  pauseBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySubtle,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pauseBannerText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 18,
  },

  balanceCard: {
    marginHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  balanceAmount: { fontSize: 32, fontWeight: '700', color: '#000' },
  balanceLabel: { fontSize: 13, color: 'rgba(0,0,0,0.6)', marginTop: 2 },
  coinsDetailBtn: {
    position: 'absolute',
    top: Spacing.lg,
    right: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  coinsDetailText: { fontSize: 11, fontWeight: '600', color: '#000' },
  balanceTicker: {
    fontSize: 11,
    color: 'rgba(0,0,0,0.55)',
    marginTop: Spacing.md,
  },

  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.xl,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingBottom: Spacing.xs,
  },
  tabText: { fontSize: 14, fontWeight: '500', color: '#999' },
  tabTextActive: { color: '#000', fontWeight: '600' },
  tabUnderline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: '#000',
    borderRadius: 1,
  },

  tabContent: { paddingHorizontal: Spacing.lg },

  methodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  methodTile: {
    width: '48%',
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#EEE',
    backgroundColor: '#F7F7F9',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  methodText: { flex: 1 },
  methodTileActive: {
    borderColor: Colors.gold,
    borderWidth: 2,
    backgroundColor: '#FFF6EC',
  },
  methodLabel: { fontSize: 15, fontWeight: '700', color: '#000' },
  methodSub: { fontSize: 11, color: '#999', marginTop: 2 },

  amountGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  amountTile: {
    width: '31.5%',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#EEE',
    backgroundColor: '#F7F7F9',
    paddingVertical: Spacing.md,
    alignItems: 'center',
    gap: 2,
    minHeight: 64,
    justifyContent: 'center',
  },
  amountTileActive: {
    borderColor: Colors.gold,
    borderWidth: 2,
    backgroundColor: '#FFF6EC',
  },
  amountCoins: { fontSize: 15, fontWeight: '700', color: '#000' },
  amountPrice: { fontSize: 12, fontWeight: '500', color: '#999' },

  payBtn: {
    marginTop: Spacing.xl,
    height: 52,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBtnDisabled: { opacity: 0.6 },
  payBtnText: { fontSize: 15, fontWeight: '600', color: '#FFF' },

  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: Spacing.sm,
  },
  sellerAvatarWrap: { position: 'relative' },
  coinSellerRibbon: {
    position: 'absolute',
    bottom: -3,
    left: -2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    backgroundColor: '#5B2FD4',
    borderRadius: Radius.full,
    paddingLeft: 1,
    paddingRight: 4,
    paddingVertical: 0,
    borderWidth: 1,
    borderColor: '#FFF',
  },
  coinSellerRibbonIcon: { width: 9, height: 9 },
  coinSellerRibbonText: { fontSize: 6, fontWeight: '700', color: '#FFF' },
  sellerMain: { flex: 1, gap: 3 },
  sellerName: { fontSize: 15, fontWeight: '700', color: '#000' },
  sellerIdRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sellerId: { fontSize: 11, color: '#999' },
  methodIconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  methodIconPill: {
    backgroundColor: '#F3F3F5',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  sellerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sellerActionIcons: { flexDirection: 'column', alignItems: 'center', gap: 4 },
  pricePill: {
    backgroundColor: Colors.gold,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  pricePillText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  chatCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#4DA6FF',
    alignItems: 'center', justifyContent: 'center',
  },
  whatsCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#22C97A',
    alignItems: 'center', justifyContent: 'center',
  },

  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: Spacing.xxl,
  },

  serviceLink: { alignItems: 'center', paddingVertical: Spacing.xxl },
  serviceLinkText: { fontSize: 13, color: Colors.primary, fontWeight: '500' },
});
