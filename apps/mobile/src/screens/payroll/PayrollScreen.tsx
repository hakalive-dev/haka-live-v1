import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { PayrollDetailRow } from '@components/PayrollDetailRow';
import { PayrollProofUpload } from '@components/PayrollProofUpload';
import { FullScreenImageModal } from '@components/FullScreenImageModal';
import { PayrollTakeOrderToggle } from '@components/PayrollTakeOrderToggle';
import { payoutDisplayRows, type PayoutSnapshot } from '@/utils/payoutDisplay';
import { payrollAgentApi, type PayrollSummary, type PayrollWithdrawalItem, type PayrollWithdrawalTab } from '@api/payrollAgent';
import { Colors, Radius, Spacing } from '@/theme';
import { useFocusEffect } from '@react-navigation/native';
import type { RootStackScreenProps } from '@navigation/types';
import {
  PAYROLL_PRESET_OPTIONS,
  payrollDayOptions,
  resolvePayrollRange,
  type PayrollDatePreset,
  type PayrollDateRange,
} from '@/utils/payrollDateRange';

const CUSTOM_DAY_OPTIONS = payrollDayOptions(90);

const BEAN_IMG = require('../../../assets/bean.png');

const PAGE_BG = '#F2F2F6';

type Props = RootStackScreenProps<'Payroll'>;

const PAYROLL_TABS: {
  key: PayrollWithdrawalTab;
  label: string;
  countKey: keyof Pick<
    PayrollSummary,
    'pendingPaymentCount' | 'awaitingConfirmationCount' | 'successCount' | 'failedCount'
  >;
}[] = [
  { key: 'assigned', label: 'Pending Payment', countKey: 'pendingPaymentCount' },
  { key: 'proof_submitted', label: 'To be confirmed by the hosts', countKey: 'awaitingConfirmationCount' },
  { key: 'success', label: 'Success', countKey: 'successCount' },
  { key: 'failed', label: 'Failed', countKey: 'failedCount' },
];

function payrollTabLabel(
  t: (typeof PAYROLL_TABS)[number],
  summary: PayrollSummary | null,
): string {
  const count = summary?.[t.countKey] ?? 0;
  if (t.key === 'assigned') {
    const newCount = summary?.newOrderCount ?? 0;
    const base = `${t.label} (${count})`;
    return newCount > 0 ? `${base} · New (${newCount})` : base;
  }
  return `${t.label} (${count})`;
}

function OrderIdRow({ orderId }: { orderId: string }) {
  const display = orderId?.trim() ? orderId : '—';
  return (
    <PayrollDetailRow
      label="Order ID"
      value={display}
      copyValue={orderId?.trim() ? orderId : undefined}
      copyable={!!orderId?.trim()}
    />
  );
}

function formatCountdown(deadlineIso: string | null): string {
  if (!deadlineIso) return '--:--';
  const ms = new Date(deadlineIso).getTime() - Date.now();
  if (ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatLocalAmount(currency: string, amount: number): string {
  const sym = currency === 'INR' ? '₹' : currency;
  return `${sym} ${amount.toLocaleString()}`;
}

function PayoutDetailSection({ snap }: { snap: PayrollWithdrawalItem['payout'] }) {
  const rows = payoutDisplayRows((snap ?? undefined) as PayoutSnapshot | undefined);
  if (!rows.length) return null;
  return (
    <>
      <View style={styles.orderDivider} />
      <Text style={styles.payoutSectionTitle}>Payout details</Text>
      {rows.map((row) => (
        <PayrollDetailRow key={row.label} label={row.label} value={row.value} />
      ))}
    </>
  );
}

function waitingListLabel(count: number): string {
  return count === 1 ? '1 order in the waiting list' : `${count} orders in the waiting list`;
}

function NewOrderCard({
  item,
  accepting,
  declining,
  onAccept,
  onDecline,
}: {
  item: PayrollWithdrawalItem;
  accepting: boolean;
  declining: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const snap = item.payout;
  return (
    <View style={styles.orderCard}>
      <View style={styles.orderHeader}>
        <View style={styles.orderAmountRow}>
          <Image source={BEAN_IMG} style={styles.orderBean} contentFit="contain" />
          <Text style={styles.orderBeans}>{item.beansAmount.toLocaleString()}</Text>
        </View>
        <Text style={[styles.orderStatus, { color: Colors.warning }]}>New Order</Text>
      </View>

      <View style={styles.orderRow}>
        <Image source={BEAN_IMG} style={styles.rowIcon} />
        <Text style={styles.orderRowLabel}>Your commission</Text>
        <Text style={styles.orderRowValue}>{item.commissionPreview.agentBeans.toLocaleString()}</Text>
      </View>

      <OrderIdRow orderId={item.orderId} />

      <PayoutDetailSection snap={snap} />

      <View style={[styles.orderFooter, { gap: Spacing.sm }]}>
        <TouchableOpacity
          style={[styles.declineBtn, declining && styles.confirmBtnDisabled]}
          onPress={onDecline}
          disabled={declining || accepting}
        >
          <Text style={styles.declineBtnText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.acceptBtn, accepting && styles.confirmBtnDisabled]}
          onPress={onAccept}
          disabled={accepting || declining}
        >
          <Text style={styles.confirmBtnText}>Accept</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PayrollOrderCard({
  item,
  onConfirm,
  confirming,
  proofUri,
  onPickProof,
  onViewProof,
}: {
  item: PayrollWithdrawalItem;
  onConfirm: () => void;
  confirming: boolean;
  proofUri: string | null;
  onPickProof: () => void;
  onViewProof: () => void;
}) {
  const snap = item.payout;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const countdown = useMemo(
    () => formatCountdown(item.slaDeadlineAt),
    [item.slaDeadlineAt, tick],
  );

  const localFormatted =
    item.localAmount != null && item.currency
      ? formatLocalAmount(item.currency, item.localAmount)
      : null;

  const headerStatus =
    item.status === 'proof_submitted' ? 'Awaiting host confirmation' : 'Pending payment';

  return (
    <View style={styles.orderCard}>
      <View style={styles.orderHeader}>
        <View style={styles.orderAmountRow}>
          <Image source={BEAN_IMG} style={styles.orderBean} contentFit="contain" />
          <Text style={styles.orderBeans}>{item.beansAmount.toLocaleString()}</Text>
        </View>
        <Text style={styles.orderStatus}>{headerStatus}</Text>
      </View>

      <View style={styles.orderRow}>
        <Image source={BEAN_IMG} style={styles.rowIcon} />
        <Text style={styles.orderRowLabel}>Commission</Text>
        <Text style={styles.orderRowValue}>{item.commissionPreview.agentBeans.toLocaleString()}</Text>
      </View>
      <View style={styles.orderRow}>
        <Image source={BEAN_IMG} style={styles.rowIcon} />
        <Text style={styles.orderRowLabel}>Payout reimbursement</Text>
        <Text style={styles.orderRowValue}>{item.commissionPreview.platformBeans.toLocaleString()}</Text>
      </View>

      <OrderIdRow orderId={item.orderId} />

      <PayoutDetailSection snap={snap} />

      {localFormatted ? (
        <>
          <View style={styles.orderDivider} />
          <PayrollDetailRow label="Local currency" value={localFormatted} copyable={false} />
          <PayrollDetailRow label="Actual amount received" value={localFormatted} copyable={false} />
        </>
      ) : null}

      {item.status === 'assigned' ? (
        <View style={styles.orderFooter}>
          <PayrollProofUpload
            fullWidth
            proofUri={proofUri}
            onPick={onPickProof}
            onView={onViewProof}
          />
          <TouchableOpacity
            style={[styles.confirmBtn, (!proofUri || confirming) && styles.confirmBtnDisabled]}
            onPress={onConfirm}
            disabled={!proofUri || confirming}
          >
            <View style={styles.confirmBtnInner}>
              <Text style={styles.confirmBtnText}>Confirm</Text>
              <Text style={styles.confirmTimer}>{countdown}</Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : item.status === 'proof_submitted' ? (
        <Text style={styles.submittedHint}>Awaiting confirmation by host</Text>
      ) : null}
    </View>
  );
}

function CompletedOrderCard({ item }: { item: PayrollWithdrawalItem }) {
  const snap = item.payout;
  const localFormatted =
    item.localAmount != null && item.currency
      ? formatLocalAmount(item.currency, item.localAmount)
      : null;
  const statusLabel = item.status === 'approved' ? 'Paid' : 'Completed';

  return (
    <View style={styles.orderCard}>
      <View style={styles.orderHeader}>
        <View style={styles.orderAmountRow}>
          <Image source={BEAN_IMG} style={styles.orderBean} contentFit="contain" />
          <Text style={styles.orderBeans}>{item.beansAmount.toLocaleString()}</Text>
        </View>
        <Text style={[styles.orderStatus, { color: Colors.success }]}>{statusLabel}</Text>
      </View>

      <View style={styles.orderRow}>
        <Image source={BEAN_IMG} style={styles.rowIcon} />
        <Text style={styles.orderRowLabel}>Commission</Text>
        <Text style={styles.orderRowValue}>{item.commissionPreview.agentBeans.toLocaleString()}</Text>
      </View>
      <View style={styles.orderRow}>
        <Image source={BEAN_IMG} style={styles.rowIcon} />
        <Text style={styles.orderRowLabel}>Payout reimbursement</Text>
        <Text style={styles.orderRowValue}>{item.commissionPreview.platformBeans.toLocaleString()}</Text>
      </View>

      <OrderIdRow orderId={item.orderId} />

      <PayoutDetailSection snap={snap} />

      {localFormatted ? (
        <>
          <View style={styles.orderDivider} />
          <PayrollDetailRow label="Local currency" value={localFormatted} copyable={false} />
          <PayrollDetailRow label="Actual amount received" value={localFormatted} copyable={false} />
        </>
      ) : null}
    </View>
  );
}

function FailedOrderCard({ item }: { item: PayrollWithdrawalItem }) {
  const snap = item.payout;
  const localFormatted =
    item.localAmount != null && item.currency
      ? formatLocalAmount(item.currency, item.localAmount)
      : null;
  const rejectionNote = item.adminRejectionNotes?.trim();

  return (
    <View style={styles.orderCard}>
      <View style={styles.orderHeader}>
        <View style={styles.orderAmountRow}>
          <Image source={BEAN_IMG} style={styles.orderBean} contentFit="contain" />
          <Text style={styles.orderBeans}>{item.beansAmount.toLocaleString()}</Text>
        </View>
        <Text style={[styles.orderStatus, { color: Colors.danger }]}>Failed</Text>
      </View>

      <View style={styles.orderRow}>
        <Image source={BEAN_IMG} style={styles.rowIcon} />
        <Text style={styles.orderRowLabel}>Commission</Text>
        <Text style={styles.orderRowValue}>{item.commissionPreview.agentBeans.toLocaleString()}</Text>
      </View>

      <OrderIdRow orderId={item.orderId} />

      <PayoutDetailSection snap={snap} />

      {localFormatted ? (
        <>
          <View style={styles.orderDivider} />
          <PayrollDetailRow label="Local currency" value={localFormatted} copyable={false} />
        </>
      ) : null}

      {rejectionNote ? (
        <>
          <View style={styles.orderDivider} />
          <PayrollDetailRow label="Rejection reason" value={rejectionNote} copyable={false} />
        </>
      ) : null}
    </View>
  );
}

export function PayrollScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [summary, setSummary] = useState<PayrollSummary | null>(null);
  const [tab, setTab] = useState<PayrollWithdrawalTab>('assigned');
  const [items, setItems] = useState<PayrollWithdrawalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [maskAmounts, setMaskAmounts] = useState(false);
  const [acceptingOrders, setAcceptingOrders] = useState(true);
  const [proofById, setProofById] = useState<Record<string, string>>({});
  const [fullScreenProofUri, setFullScreenProofUri] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);

  const [datePreset, setDatePreset] = useState<PayrollDatePreset>('30d');
  const [customFrom, setCustomFrom] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  });
  const [customTo, setCustomTo] = useState<Date>(() => new Date());
  const [dateRange, setDateRange] = useState<PayrollDateRange>(() => resolvePayrollRange('30d'));

  const [presetModalVisible, setPresetModalVisible] = useState(false);
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'from' | 'to'>('from');

  const tabsScrollRef = useRef<ScrollView>(null);
  const tabLayoutsRef = useRef<Partial<Record<PayrollWithdrawalTab, { x: number; width: number }>>>({});

  const load = useCallback(async () => {
    try {
      const [sum, list] = await Promise.all([
        payrollAgentApi.getSummary(dateRange.from, dateRange.to),
        payrollAgentApi.listWithdrawals(1, tab),
      ]);
      setSummary(sum);
      setAcceptingOrders(sum.acceptingOrders);
      setItems(list.items);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load payroll');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab, dateRange.from, dateRange.to]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const handleTabPress = (key: PayrollWithdrawalTab) => {
    if (key === tab) return;
    setTab(key);
    setItems([]);
    setLoading(true);
    const layout = tabLayoutsRef.current[key];
    if (layout && tabsScrollRef.current) {
      tabsScrollRef.current.scrollTo({
        x: Math.max(0, layout.x - Spacing.lg),
        animated: true,
      });
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const applyPreset = (preset: Exclude<PayrollDatePreset, 'custom'>) => {
    setDatePreset(preset);
    setDateRange(resolvePayrollRange(preset));
    setPresetModalVisible(false);
  };

  const applyCustomRange = () => {
    if (customFrom > customTo) {
      Alert.alert('Invalid range', 'Start date must be before end date.');
      return;
    }
    setDatePreset('custom');
    setDateRange(resolvePayrollRange('custom', customFrom, customTo));
    setCustomModalVisible(false);
  };

  const toggleAccepting = async (value: boolean) => {
    setAcceptingOrders(value);
    try {
      await payrollAgentApi.patchMe(value);
      setSummary((s) => (s ? { ...s, acceptingOrders: value } : s));
    } catch {
      setAcceptingOrders(!value);
      Alert.alert('Error', 'Could not update take-order setting');
    }
  };

  const pickProof = async (id: string) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to upload payment proof.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setProofById((prev) => ({ ...prev, [id]: result.assets[0].uri }));
    }
  };

  const confirmOrder = (item: PayrollWithdrawalItem) => {
    const uri = proofById[item.id];
    if (!uri) return;
    Alert.alert(
      'Confirm payout',
      'Submit payment proof for admin verification?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setConfirmingId(item.id);
            try {
              await payrollAgentApi.submitProof(item.id, uri, '', '');
              Alert.alert('Submitted', 'Payment proof sent for review.');
              setProofById((prev) => {
                const next = { ...prev };
                delete next[item.id];
                return next;
              });
              await load();
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Upload failed');
            } finally {
              setConfirmingId(null);
            }
          },
        },
      ],
    );
  };

  const handleAccept = async (item: PayrollWithdrawalItem) => {
    setAcceptingId(item.id);
    try {
      await payrollAgentApi.accept(item.id);
      await load();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not accept order');
    } finally {
      setAcceptingId(null);
    }
  };

  const handleDecline = (item: PayrollWithdrawalItem) => {
    Alert.alert(
      'Decline order',
      'Decline this withdrawal? It will be reassigned to another agent.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setDecliningId(item.id);
            try {
              await payrollAgentApi.decline(item.id);
              await load();
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Could not decline order');
            } finally {
              setDecliningId(null);
            }
          },
        },
      ],
    );
  };

  const displayPayment = summary
    ? maskAmounts
      ? '••••••'
      : summary.paymentAmount.toLocaleString()
    : '—';

  const presetLabel = dateRange.label;

  const selectCustomDay = (day: Date) => {
    if (pickerTarget === 'from') {
      setCustomFrom(day);
      if (day > customTo) setCustomTo(day);
      setPickerTarget('to');
    } else {
      setCustomTo(day);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payroll</Text>
        <TouchableOpacity
          hitSlop={8}
          onPress={() => navigation.navigate('Notifications')}
          accessibilityLabel="Notifications"
        >
          <Ionicons name="notifications-outline" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.dateBar}>
        <TouchableOpacity
          style={styles.dateBarLeft}
          onPress={() => setPresetModalVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="calendar-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.datePreset}>{presetLabel}</Text>
          <Ionicons name="chevron-down" size={14} color={Colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.dateBarDivider} />
        <TouchableOpacity
          style={styles.dateBarRight}
          onPress={() => setCustomModalVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="calendar-outline" size={16} color={Colors.payroll} />
          <Text style={styles.dateSelect}>Select date</Text>
        </TouchableOpacity>
      </View>

      <LinearGradient colors={['#FF2D55', '#E02048']} style={styles.summaryCard}>
        <View style={styles.summaryTop}>
          <Text style={styles.summaryLabel}>Payment amount</Text>
          <TouchableOpacity onPress={() => setMaskAmounts((m) => !m)} hitSlop={8}>
            <Ionicons
              name={maskAmounts ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={Colors.textInverse}
            />
          </TouchableOpacity>
        </View>
        <Text style={styles.summaryBig}>{displayPayment}</Text>

        <View style={styles.summaryStats}>
          <View>
            <Text style={styles.summaryStatLabel}>Points of earnings ⓘ</Text>
            <Text style={styles.summaryStatValue}>
              {maskAmounts ? '•••' : (summary?.pointsOfEarnings ?? 0).toLocaleString()}
            </Text>
          </View>
          <View>
            <Text style={styles.summaryStatLabel}>Platform reward ⓘ</Text>
            <Text style={styles.summaryStatValue}>
              {maskAmounts ? '•••' : (summary?.platformReward ?? 0).toLocaleString()}
            </Text>
          </View>
        </View>

        <View style={styles.takeOrderRow}>
          <Text style={styles.takeOrderLabel}>take order now</Text>
          <PayrollTakeOrderToggle value={acceptingOrders} onValueChange={toggleAccepting} />
        </View>
      </LinearGradient>

      <ScrollView
        ref={tabsScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsRow}
      >
        {PAYROLL_TABS.map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => handleTabPress(t.key)}
              onLayout={(e) => {
                const { x, width } = e.nativeEvent.layout;
                tabLayoutsRef.current[t.key] = { x, width };
              }}
            >
              <Text
                style={[styles.tabText, active && styles.tabTextActive]}
                numberOfLines={2}
              >
                {payrollTabLabel(t, summary)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {(summary?.waitingListCount ?? 0) > 0 ? (
        <View style={styles.waitingBar}>
          <Text style={styles.waitingHint}>
            {waitingListLabel(summary!.waitingListCount)}
          </Text>
        </View>
      ) : null}

      <FlatList
        key={tab}
        style={styles.list}
        data={items}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>No orders in this tab.</Text>
          ) : (
            <Text style={styles.empty}>Loading…</Text>
          )
        }
        renderItem={({ item }) => {
          if (tab === 'success') {
            return <CompletedOrderCard item={item} />;
          }
          if (tab === 'failed') {
            return <FailedOrderCard item={item} />;
          }
          if (tab === 'proof_submitted') {
            return (
              <PayrollOrderCard
                item={item}
                proofUri={proofById[item.id] ?? null}
                confirming={confirmingId === item.id}
                onPickProof={() => void pickProof(item.id)}
                onViewProof={() => {
                  const uri = proofById[item.id];
                  if (uri) setFullScreenProofUri(uri);
                }}
                onConfirm={() => void confirmOrder(item)}
              />
            );
          }
          if (item.acceptedAt == null) {
            return (
              <NewOrderCard
                item={item}
                accepting={acceptingId === item.id}
                declining={decliningId === item.id}
                onAccept={() => void handleAccept(item)}
                onDecline={() => handleDecline(item)}
              />
            );
          }
          return (
            <PayrollOrderCard
              item={item}
              proofUri={proofById[item.id] ?? null}
              confirming={confirmingId === item.id}
              onPickProof={() => void pickProof(item.id)}
              onViewProof={() => {
                const uri = proofById[item.id];
                if (uri) setFullScreenProofUri(uri);
              }}
              onConfirm={() => void confirmOrder(item)}
            />
          );
        }}
      />

      <Modal
        visible={presetModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPresetModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPresetModalVisible(false)}>
          <View style={styles.presetSheet}>
            <Text style={styles.modalTitle}>Date range</Text>
            {PAYROLL_PRESET_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={styles.presetOption}
                onPress={() => applyPreset(opt.key)}
              >
                <Text
                  style={[
                    styles.presetOptionText,
                    datePreset === opt.key && styles.presetOptionTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
                {datePreset === opt.key ? (
                  <Ionicons name="checkmark" size={18} color={Colors.payroll} />
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={customModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCustomModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.customSheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <Text style={styles.modalTitle}>Select date range</Text>
            <View style={styles.pickerRow}>
              <Text style={styles.pickerLabel}>From</Text>
              <TouchableOpacity
                style={[
                  styles.pickerBtn,
                  pickerTarget === 'from' && styles.pickerBtnActive,
                ]}
                onPress={() => setPickerTarget('from')}
              >
                <Text style={styles.pickerBtnText}>
                  {customFrom.toLocaleDateString()}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.pickerRow}>
              <Text style={styles.pickerLabel}>To</Text>
              <TouchableOpacity
                style={[
                  styles.pickerBtn,
                  pickerTarget === 'to' && styles.pickerBtnActive,
                ]}
                onPress={() => setPickerTarget('to')}
              >
                <Text style={styles.pickerBtnText}>
                  {customTo.toLocaleDateString()}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.pickerHint}>
              Tap From or To, then choose a day below
            </Text>
            <ScrollView style={styles.dayList} nestedScrollEnabled>
              {CUSTOM_DAY_OPTIONS.map((opt) => {
                const active =
                  pickerTarget === 'from'
                    ? opt.date.getTime() === customFrom.getTime()
                    : opt.date.getTime() === customTo.getTime();
                return (
                  <TouchableOpacity
                    key={opt.label}
                    style={[styles.dayRow, active && styles.dayRowActive]}
                    onPress={() => selectCustomDay(opt.date)}
                  >
                    <Text
                      style={[styles.dayRowText, active && styles.dayRowTextActive]}
                    >
                      {opt.label}
                    </Text>
                    {active ? (
                      <Ionicons name="checkmark" size={18} color={Colors.payroll} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setCustomModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalApplyBtn} onPress={applyCustomRange}>
                <Text style={styles.modalApplyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <FullScreenImageModal
        visible={!!fullScreenProofUri}
        uri={fullScreenProofUri}
        onClose={() => setFullScreenProofUri(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  dateBarLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  dateBarDivider: {
    width: 1,
    height: 20,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
  },
  dateBarRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.xs,
  },
  datePreset: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
  dateSelect: { fontSize: 14, color: Colors.payroll, fontWeight: '600' },
  summaryCard: {
    marginHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { color: Colors.textInverse, fontSize: 14, opacity: 0.9 },
  summaryBig: { color: Colors.textInverse, fontSize: 28, fontWeight: '700', marginVertical: Spacing.sm },
  summaryStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
  summaryStatLabel: { color: Colors.textInverse, fontSize: 12, opacity: 0.85 },
  summaryStatValue: { color: Colors.textInverse, fontSize: 20, fontWeight: '700', marginTop: 4 },
  takeOrderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  takeOrderLabel: { color: Colors.textInverse, fontSize: 14, fontWeight: '600' },
  tabsScroll: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: Spacing.sm,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing.xs,
    alignItems: 'center',
  },
  tab: {
    flexShrink: 0,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  list: { flex: 1 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.payroll },
  tabText: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center' },
  tabTextActive: { color: Colors.payroll, fontWeight: '600' },
  waitingBar: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surfaceHighlight,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  waitingHint: {
    color: Colors.payroll,
    fontSize: 13,
    fontWeight: '500',
  },
  orderCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  payoutSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  orderAmountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  orderBean: { width: 28, height: 28 },
  orderBeans: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary },
  orderStatus: { fontSize: 13, fontWeight: '600', color: Colors.info },
  orderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xs },
  rowIcon: { width: 16, height: 16, marginRight: Spacing.xs },
  orderRowLabel: { flex: 1, fontSize: 13, color: Colors.textSecondary },
  orderRowValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  orderDetailText: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.xs },
  orderDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  orderFooter: {
    marginTop: Spacing.md,
    gap: Spacing.md,
  },
  confirmBtn: {
    width: '100%',
    backgroundColor: Colors.payroll,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    justifyContent: 'center',
    minHeight: 52,
  },
  confirmBtnDisabled: { opacity: 0.5 },
  declineBtn: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtnText: {
    color: Colors.danger,
    fontWeight: '600',
    fontSize: 14,
  },
  acceptBtn: {
    flex: 1,
    height: 44,
    backgroundColor: Colors.success,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  confirmBtnText: { color: Colors.textInverse, fontWeight: '700', fontSize: 15 },
  confirmTimer: { color: Colors.textInverse, fontSize: 14, fontWeight: '600' },
  submittedHint: { marginTop: Spacing.md, fontSize: 13, color: Colors.textTertiary },
  empty: { textAlign: 'center', color: Colors.textTertiary, marginTop: Spacing.xl },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  presetSheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: Spacing.lg,
    marginTop: 'auto',
  },
  customSheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: Spacing.lg,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  presetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  presetOptionText: { fontSize: 15, color: Colors.textPrimary },
  presetOptionTextActive: { color: Colors.payroll, fontWeight: '600' },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  pickerLabel: { width: 40, fontSize: 14, color: Colors.textSecondary },
  pickerBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
  },
  pickerBtnText: { fontSize: 14, color: Colors.textPrimary },
  pickerBtnActive: { borderColor: Colors.payroll },
  pickerHint: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginBottom: Spacing.sm,
  },
  dayList: { maxHeight: 220, marginBottom: Spacing.md },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dayRowActive: { backgroundColor: Colors.primarySubtle },
  dayRowText: { fontSize: 14, color: Colors.textPrimary },
  dayRowTextActive: { color: Colors.payroll, fontWeight: '600' },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalCancelText: { color: Colors.textSecondary, fontWeight: '600' },
  modalApplyBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderRadius: Radius.md,
    backgroundColor: Colors.payroll,
  },
  modalApplyText: { color: Colors.textInverse, fontWeight: '700' },
});
