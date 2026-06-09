import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSelector } from 'react-redux';

const COIN_IMG = require('../../../assets/coin.png');
const BEAN_IMG = require('../../../assets/bean.png');

import { walletApi } from '@api/wallet';
import { Colors, Radius, Spacing } from '@/theme';
import { KeyboardAwareScroll } from '@components/keyboard';
import { WalletSkeleton } from '@components/Skeleton';
import type { ExchangeRateRule, ExchangeResult, WalletBalance, WalletTransaction } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';
import type { RootState } from '@/store';

type Props = RootStackScreenProps<'ExchangeCoin'>;

const SCREEN_W = Dimensions.get('window').width;

// Simple random captcha generator
function generateCaptcha(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

export function ExchangeCoinsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const user = useSelector((s: RootState) => s.auth.user);

  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [rates, setRates] = useState<ExchangeRateRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [exchanging, setExchanging] = useState(false);

  // Selection state
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [customBeans, setCustomBeans] = useState('');

  // Captcha
  const [captcha, setCaptcha] = useState(generateCaptcha);
  const [captchaInput, setCaptchaInput] = useState('');

  // Overlays
  const [historyVisible, setHistoryVisible] = useState(false);

  useEffect(() => {
    Promise.allSettled([walletApi.getBalance(), walletApi.getExchangeRates()])
      .then(([balResult, ratesResult]) => {
        if (balResult.status === 'fulfilled') setBalance(balResult.value);
        if (ratesResult.status === 'fulfilled') setRates(ratesResult.value);
      })
      .finally(() => setLoading(false));
  }, []);

  const selectedRule = useMemo(
    () => rates.find((r) => r.id === selectedRuleId) ?? null,
    [rates, selectedRuleId],
  );

  const captchaValid = captchaInput.toUpperCase() === captcha;

  const canExchange = useMemo(() => {
    if (!balance) return false;
    if (!captchaValid) return false;
    if (customMode) {
      const beans = parseInt(customBeans, 10) || 0;
      return beans >= 100 && beans <= balance.beanBalance;
    }
    return selectedRule !== null && balance.beanBalance >= selectedRule.beansCost;
  }, [balance, customMode, customBeans, selectedRule, captchaValid]);

  const handleSelectPreset = useCallback((ruleId: string) => {
    setCustomMode(false);
    setSelectedRuleId((prev) => (prev === ruleId ? null : ruleId));
  }, []);

  const handleCustomize = useCallback(() => {
    setSelectedRuleId(null);
    setCustomMode(true);
  }, []);

  const handleRefreshCaptcha = useCallback(() => {
    setCaptcha(generateCaptcha());
    setCaptchaInput('');
  }, []);

  const handleExchange = useCallback(async () => {
    if (!canExchange) return;
    setExchanging(true);
    try {
      let result: ExchangeResult;
      if (customMode) {
        const beans = parseInt(customBeans, 10);
        result = await walletApi.exchange(beans);
      } else {
        const rule = rates.find((r) => r.id === selectedRuleId);
        result = await walletApi.exchange(rule!.beansCost);
      }
      setBalance((prev) =>
        prev ? { ...prev, coinBalance: result.coinBalance, beanBalance: result.beanBalance } : prev,
      );
      Alert.alert(
        'Exchange Successful',
        `You received ${result.coinsEarned.toLocaleString()} coins`,
      );
      setSelectedRuleId(null);
      setCustomMode(false);
      setCustomBeans('');
      setCaptchaInput('');
      handleRefreshCaptcha();
    } catch (e: unknown) {
      Alert.alert('Exchange Failed', e instanceof Error ? e.message : 'Please try again');
    } finally {
      setExchanging(false);
    }
  }, [canExchange, customMode, customBeans, selectedRuleId, handleRefreshCaptcha]);

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
        <Text style={styles.headerTitle}>Exchange Coins</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAwareScroll
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxxl }}
      >
        {/* Red gradient card */}
        <LinearGradient
          colors={['#FF4D6A', '#CC1E3C']}
          style={styles.card}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.cardLabelRow}>
            <Text style={styles.cardLabel}>Available points</Text>
            <Image source={BEAN_IMG} style={styles.cardLabelIcon} />
          </View>
          <Text style={styles.cardPointsValue}>
            {(balance?.beanBalance ?? 0).toLocaleString()}
          </Text>
          <View style={styles.cardBottomRow}>
            <View style={styles.cardStatCol}>
              <View style={styles.cardStatLabelRow}>
                <Text style={styles.cardStatLabel}>Total</Text>
                <Image source={BEAN_IMG} style={styles.cardStatIcon} />
              </View>
              <Text style={styles.cardStatValue}>
                {(balance?.beanBalance ?? 0).toLocaleString()}
              </Text>
            </View>
            <View style={styles.cardStatCol}>
              <View style={styles.cardStatLabelRow}>
                <Text style={styles.cardStatLabel}>Unconfirmed</Text>
                <Image source={COIN_IMG} style={styles.cardStatIcon} />
              </View>
              <Text style={styles.cardStatValue}>0</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Exchange quantity header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Exchange quantity</Text>
          <TouchableOpacity
            style={styles.historyBtn}
            onPress={() => setHistoryVisible(true)}
          >
            <Ionicons name="calendar-outline" size={14} color="#666" />
            <Text style={styles.historyBtnText}>Last 30 days</Text>
            <Ionicons name="chevron-down" size={12} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Preset grid */}
        <View style={styles.presetsGrid}>
          {rates.filter((r) => r.isPreset).map((rule) => {
            const isSelected = selectedRuleId === rule.id && !customMode;
            return (
              <TouchableOpacity
                key={rule.id}
                style={[styles.presetBtn, isSelected && styles.presetBtnSelected]}
                onPress={() => handleSelectPreset(rule.id)}
                activeOpacity={0.7}
              >
                <View style={styles.presetCoinRow}>
                  <Image source={COIN_IMG} style={styles.presetIcon} />
                  <Text style={[styles.presetCoins, isSelected && styles.presetCoinsSelected]}>
                    {rule.coins.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.presetBeanRow}>
                  <Image source={BEAN_IMG} style={styles.presetIconSm} />
                  <Text style={[styles.presetBeans, isSelected && styles.presetBeansSelected]}>
                    {rule.beansCost.toLocaleString()}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Customize */}
        {customMode ? (
          <View style={styles.customSection}>
            <TextInput
              style={styles.customInput}
              value={customBeans}
              onChangeText={setCustomBeans}
              keyboardType="number-pad"
              placeholder="Enter beans amount (min 100)"
              placeholderTextColor="#999"
              maxLength={9}
            />
            {parseInt(customBeans, 10) >= 100 && (
              <Text style={styles.customPreview}>
                = {Math.floor(parseInt(customBeans, 10) / 2).toLocaleString()} coins
              </Text>
            )}
          </View>
        ) : (
          <TouchableOpacity style={styles.customizeBtn} onPress={handleCustomize}>
            <Text style={styles.customizeBtnText}>Customize</Text>
          </TouchableOpacity>
        )}

        {/* Agent note */}
        <Text style={styles.agentNote}>
          For agent, coins will be redeemed to your agency account by default.{' '}
          <Text style={{ color: Colors.primary }}>→</Text>
        </Text>

        {/* Verification quantity */}
        <Text style={styles.verifyTitle}>Verification quantity</Text>
        <View style={styles.verifyRow}>
          <TextInput
            style={styles.verifyInput}
            value={captchaInput}
            onChangeText={setCaptchaInput}
            placeholder="Enter verification code"
            placeholderTextColor="#999"
            autoCapitalize="characters"
            maxLength={6}
          />
          <View style={styles.captchaBox}>
            <Text style={styles.captchaText}>{captcha}</Text>
          </View>
          <TouchableOpacity hitSlop={8} onPress={handleRefreshCaptcha}>
            <Ionicons name="refresh" size={20} color={Colors.success} />
          </TouchableOpacity>
        </View>

        {/* Exchange button */}
        <TouchableOpacity
          style={[styles.exchangeBtn, !canExchange && styles.exchangeBtnDisabled]}
          onPress={handleExchange}
          disabled={!canExchange || exchanging}
        >
          <LinearGradient
              colors={Colors.gradientPurple}
              style={styles.exchangeBtnGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.exchangeBtnText}>Exchange Coins</Text>
            </LinearGradient>
        </TouchableOpacity>

        {/* Rule description - inline */}
        <View style={styles.rulesSection}>
          <Text style={styles.rulesSectionTitle}>Rule description</Text>

          <Text style={styles.rulesSubTitle}>Exchange points for coins:</Text>
          <View style={styles.rulesTable}>
            <RuleRow left="Single purchase amount" right="$1 =" icon={BEAN_IMG} value="200" />
            <RuleRow left="< $50" right="$1 =" icon={BEAN_IMG} value="200" />
            <RuleRow left="$50 × N × $1,000" right="$1 =" icon={BEAN_IMG} value="200" />
            <RuleRow left="N ≥ $3,000" icon={BEAN_IMG} value="× 200" />
          </View>

          <Text style={styles.rulesSubTitle}>Purchase coins through Epay:</Text>
          <View style={styles.rulesTable}>
            <RuleRow left="Single purchase amount" right="$1 =" icon={BEAN_IMG} value="200" />
            <RuleRow left="< $500" right="$1 =" icon={BEAN_IMG} value="200" />
            <RuleRow left="$500 × N × $1,000" right="$1 =" icon={BEAN_IMG} value="200" />
            <RuleRow left="N ≥ $2,000" right="$1 =" icon={BEAN_IMG} value="200" />
          </View>

          {/* Notes */}
          <View style={styles.rulesNotes}>
            <Text style={styles.rulesNoteText}>
              1. After exchanging successful, the agent coin account will be increased to the correspond point.
            </Text>
            <Text style={styles.rulesNoteText}>
              2. Cancellation is not allowed after exchange.
            </Text>
            <Text style={styles.rulesNoteText}>
              3. For small amount purchase, please buy from coin seller.
            </Text>
            <Text style={styles.rulesNoteText}>
              4. If you have any concern of the price the agent sell to users, please contact the corresponding regional admins for further consulting.
            </Text>
          </View>
        </View>
      </KeyboardAwareScroll>

      {/* History overlay */}
      <HistoryOverlay visible={historyVisible} onClose={() => setHistoryVisible(false)} />
    </View>
  );
}

// ── Rule table row ───────────────────────────────────────────────────────────

function RuleRow({ left, right, icon, value }: { left: string; right?: string; icon: any; value: string }) {
  return (
    <View style={styles.rulesTableRow}>
      <Text style={[styles.rulesTableCell, styles.rulesTableCellLeft]}>{left}</Text>
      <View style={[styles.rulesTableCellView]}>
        {right ? <Text style={styles.rulesCellText}>{right} </Text> : null}
        <Image source={icon} style={styles.rulesCellIcon} />
        <Text style={styles.rulesCellText}> {value}</Text>
      </View>
    </View>
  );
}

// ── History Overlay ──────────────────────────────────────────────────────────

function HistoryOverlay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [history, setHistory] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    walletApi.getExchangeHistory()
      .then(setHistory)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlayBackdrop} onPress={onClose} />
      <View style={[styles.overlaySheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={styles.overlayHandle} />
        <View style={styles.overlayHeader}>
          <Text style={styles.overlayTitle}>Recent</Text>
          <Text style={styles.overlaySubtitle}>last 30 days</Text>
        </View>

        {history.length === 0 ? (
          <View style={styles.overlayEmpty}>
            <Ionicons name="receipt-outline" size={40} color="#DDD" />
            <Text style={styles.overlayEmptyText}>No exchanges yet</Text>
          </View>
        ) : (
          <FlatList
            data={history}
            keyExtractor={(item) => item.id}
            style={{ maxHeight: 400 }}
            renderItem={({ item }) => (
              <View style={styles.historyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyDesc}>{item.description}</Text>
                  <Text style={styles.historyDate}>
                    {new Date(item.createdAt).toLocaleDateString([], {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.historyAmount,
                    item.transactionType === 'credit'
                      ? { color: Colors.success }
                      : { color: Colors.danger },
                  ]}
                >
                  {item.transactionType === 'credit' ? '+' : '-'}
                  {item.amount.toLocaleString()}
                </Text>
              </View>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const PRESET_W = (SCREEN_W - Spacing.lg * 2 - Spacing.sm) / 2;

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

  // ── Red gradient card ──────────────────────────────────────────────────────
  card: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
  },
  cardLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
  },
  cardLabelIcon: {
    width: 14,
    height: 14,
  },
  cardPointsValue: {
    fontSize: 30,
    fontWeight: '700',
    color: '#FFF',
    marginTop: Spacing.xs,
  },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  cardStatCol: {
    gap: 2,
  },
  cardStatLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  cardStatIcon: {
    width: 10,
    height: 10,
  },
  cardStatLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
  },
  cardStatValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },

  // ── Section header ─────────────────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  historyBtnText: {
    fontSize: 12,
    color: '#666',
  },

  // ── Presets grid ───────────────────────────────────────────────────────────
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  presetBtn: {
    width: PRESET_W,
    backgroundColor: '#FFF8EE',
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1.5,
    borderColor: '#E8A020',
  },
  presetBtnSelected: {
    backgroundColor: '#E8A020',
    borderColor: '#E8A020',
  },
  presetCoinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  presetIcon: {
    width: 20,
    height: 20,
  },
  presetCoins: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  presetCoinsSelected: {
    color: '#FFF',
  },
  presetBeanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  presetIconSm: {
    width: 14,
    height: 14,
  },
  presetBeans: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FF4D6A',
  },
  presetBeansSelected: {
    color: 'rgba(255,255,255,0.85)',
  },

  // ── Customize ──────────────────────────────────────────────────────────────
  customizeBtn: {
    alignSelf: 'center',
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  customizeBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  customSection: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  customInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: Radius.md,
    height: 48,
    paddingHorizontal: Spacing.lg,
    fontSize: 15,
    color: '#000',
  },
  customPreview: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.success,
    textAlign: 'center',
  },

  // ── Agent note ─────────────────────────────────────────────────────────────
  agentNote: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
  },

  // ── Verification ───────────────────────────────────────────────────────────
  verifyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  verifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  verifyInput: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: Radius.md,
    height: 44,
    paddingHorizontal: Spacing.md,
    fontSize: 14,
    color: '#000',
  },
  captchaBox: {
    backgroundColor: '#E8E0FF',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captchaText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
    letterSpacing: 3,
  },

  // ── Exchange button ────────────────────────────────────────────────────────
  exchangeBtn: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  exchangeBtnDisabled: {
    opacity: 0.45,
  },
  exchangeBtnGradient: {
    height: 52,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exchangeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },

  // ── Rules section (inline) ─────────────────────────────────────────────────
  rulesSection: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xxl,
  },
  rulesSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
    marginBottom: Spacing.md,
    textDecorationLine: 'underline',
  },
  rulesSubTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  rulesTable: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  rulesTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  rulesTableCell: {
    flex: 1,
    fontSize: 12,
    color: '#333',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  rulesTableCellLeft: {
    borderRightWidth: 1,
    borderRightColor: '#F0F0F0',
  },
  rulesTableCellView: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  rulesCellText: {
    fontSize: 12,
    color: '#333',
  },
  rulesCellIcon: {
    width: 14,
    height: 14,
  },

  // ── Rules notes ────────────────────────────────────────────────────────────
  rulesNotes: {
    marginTop: Spacing.lg,
    gap: Spacing.xs,
  },
  rulesNoteText: {
    fontSize: 11,
    color: '#999',
    lineHeight: 16,
  },

  // ── Overlays ───────────────────────────────────────────────────────────────
  overlayBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  overlaySheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    maxHeight: '80%',
  },
  overlayHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  overlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  overlayTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  overlaySubtitle: {
    fontSize: 12,
    color: '#999',
  },
  overlayEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxxl,
    gap: Spacing.sm,
  },
  overlayEmptyText: {
    fontSize: 14,
    color: '#999',
  },

  // ── History rows ───────────────────────────────────────────────────────────
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  historyDesc: {
    fontSize: 13,
    fontWeight: '500',
    color: '#000',
  },
  historyDate: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  historyAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
});
