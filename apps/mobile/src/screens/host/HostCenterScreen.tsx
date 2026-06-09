import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSelector } from 'react-redux';

import {
  hostsApi,
  type HostIncome,
  type HostTierInfo,
  type MicProgress,
  type AgentLite,
  type HostAgencyChangeRequest,
} from '@api/hosts';
import { Spacing } from '@/theme';
import { DetailSkeleton } from '@components/Skeleton';
import { KeyboardAwareScroll } from '@components/keyboard';
import { UserAvatar } from '@components/UserAvatar';
import type { RootStackScreenProps } from '@navigation/types';
import type { RootState } from '@store/index';

type Props = RootStackScreenProps<'HostCenter'>;

const GOLD = '#FACB1B';
const PRIMARY = '#5F22D9';
const DARK_PURPLE = '#7A0E9D';
const RED_BORDER = '#FF2A23';
const GREEN_BORDER = '#14AE5C';
const CARD_BG = 'rgba(91, 30, 216, 0.12)';
const MIC_CARD_BG = 'rgba(255, 204, 0, 0.1)';
const AGENCY_BG = 'rgba(255, 98, 66, 0.25)';
const CONTACT_BG = 'rgba(105, 96, 249, 0.40)';

/** Background refresh while Host Center is focused (socket handles most updates). */
const REFRESH_INTERVAL_MS = 60_000;

export function HostCenterScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const lastHostCenterTickAt = useSelector((s: RootState) => s.auth.lastHostCenterTickAt);

  const [agent, setAgent] = useState<AgentLite | null>(null);
  const [official, setOfficial] = useState<AgentLite | null>(null);
  const [today, setToday] = useState<HostIncome | null>(null);
  const [week7d, setWeek7d] = useState<HostIncome | null>(null);
  const [weekly, setWeekly] = useState<HostIncome | null>(null);
  const [tier, setTier] = useState<HostTierInfo | null>(null);
  const [mic, setMic] = useState<MicProgress | null>(null);
  const [pendingChange, setPendingChange] = useState<HostAgencyChangeRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const [changeModalOpen, setChangeModalOpen] = useState(false);
  const [changeAgentId, setChangeAgentId] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [changeSubmitting, setChangeSubmitting] = useState(false);

  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setError(false);
    try {
      const [a, o, t, w7, wk, ti, m, pending] = await Promise.all([
        hostsApi.getAgency(),
        hostsApi.getOfficialContact(),
        hostsApi.getIncome('today'),
        hostsApi.getIncome('7d'),
        hostsApi.getIncome('weekly'),
        hostsApi.getTier(),
        hostsApi.getMicProgress(),
        hostsApi.getMyPendingAgencyChange().catch(() => null),
      ]);
      if (seq !== loadSeq.current) return;
      setAgent(a.agent);
      setOfficial(o.user);
      setToday(t);
      setWeek7d(w7);
      setWeekly(wk);
      setTier(ti);
      setMic(m);
      setPendingChange(pending);
    } catch {
      if (seq === loadSeq.current) setError(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load().finally(() => setLoading(false));

      const interval = setInterval(() => {
        void load();
      }, REFRESH_INTERVAL_MS);

      return () => clearInterval(interval);
    }, [load]),
  );

  useEffect(() => {
    if (lastHostCenterTickAt == null) return;
    load();
  }, [lastHostCenterTickAt, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleLeaveAgency = () => {
    if (!agent) {
      Alert.alert('No agency', 'You are an independent host.');
      return;
    }
    if (pendingChange) {
      Alert.alert('Pending request', 'You already have a pending leave or change request.');
      return;
    }
    Alert.alert('Leave Agency', `Submit a request to leave ${agent.displayName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Submit',
        style: 'destructive',
        onPress: async () => {
          try {
            await hostsApi.requestLeaveAgency('');
            await load();
            Alert.alert('Request submitted', 'Your agent will review your request.');
          } catch (e: unknown) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to submit request');
          }
        },
      },
    ]);
  };

  const submitChangeAgency = async () => {
    if (!changeAgentId.trim()) {
      Alert.alert('Required', 'Enter the target agent ID (Haka ID, username, or UUID).');
      return;
    }
    if (pendingChange) {
      Alert.alert('Pending request', 'You already have a pending request.');
      return;
    }
    setChangeSubmitting(true);
    try {
      await hostsApi.requestChangeAgency(changeAgentId.trim(), changeReason.trim());
      setChangeModalOpen(false);
      setChangeAgentId('');
      setChangeReason('');
      await load();
      Alert.alert('Request submitted', 'Your current agent must approve before you move.');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to submit');
    } finally {
      setChangeSubmitting(false);
    }
  };

  const handleBecomeAgency = () => {
    navigation.navigate('BecomeAgent');
  };

  const currentRate = tier?.currentTier?.hourlyRateBeans ?? 0;
  const nextRate = tier?.nextTier?.hourlyRateBeans ?? 0;
  const tierIdx =
    tier?.currentTier != null ? tier.tiers.findIndex((x) => x.id === tier.currentTier!.id) : -1;
  const tiersList = tier?.tiers ?? [];
  const tierNext2 = tierIdx >= 0 ? tiersList[tierIdx + 2] : null;
  const tierNext3 = tierIdx >= 0 ? tiersList[tierIdx + 3] : null;
  const upgradePill1 = nextRate || currentRate;
  const upgradePill2 =
    tierNext2 && tierNext2.hourlyRateBeans !== upgradePill1
      ? tierNext2.hourlyRateBeans
      : tierNext3?.hourlyRateBeans ?? upgradePill1;
  const upgradePill3 =
    tierNext3 && tierNext3.hourlyRateBeans !== upgradePill2
      ? tierNext3.hourlyRateBeans
      : upgradePill2;

  const progressPct = Math.round((tier?.progress ?? 0) * 100);
  const minutesOnMic = mic?.minutesOnMic ?? 0;
  const minutesTarget = mic?.minutesTarget ?? 120;
  const targetHours = Math.floor(minutesTarget / 60);
  const hoursOnMic = mic?.hoursOnMicToday ?? 0;
  const minsOnMicRem = mic?.minutesOnMicToday ?? 0;
  const pointsTarget = mic?.pointsTargetBeans ?? 5000;
  const todayPoints = today?.totalBeans ?? 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Host Centre</Text>
        <View style={{ width: 40 }} />
      </View>

      <Modal visible={changeModalOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Change agency</Text>
            <Text style={styles.modalHint}>
              Enter the agent you want to join (Haka ID, username, or UUID). Your current agent must
              approve first.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Target agent ID"
              placeholderTextColor="#999"
              value={changeAgentId}
              onChangeText={setChangeAgentId}
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.modalInput, styles.modalInputMultiline]}
              placeholder="Reason (optional)"
              placeholderTextColor="#999"
              value={changeReason}
              onChangeText={setChangeReason}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtnGhost}
                onPress={() => setChangeModalOpen(false)}
                disabled={changeSubmitting}
              >
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnPrimary}
                onPress={submitChangeAgency}
                disabled={changeSubmitting}
              >
                <Text style={styles.modalBtnPrimaryText}>{changeSubmitting ? '…' : 'Submit'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {loading ? (
        <DetailSkeleton />
      ) : error ? (
        <View style={styles.centerBox}>
          <Ionicons name="alert-circle-outline" size={40} color="#FF4D4D" />
          <Text style={styles.errorText}>Failed to load host data</Text>
          <TouchableOpacity
            onPress={() => {
              setLoading(true);
              load().finally(() => setLoading(false));
            }}
          >
            <Text style={styles.retry}>Tap to retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <KeyboardAwareScroll
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />}
        >
          <LinearGradient
            colors={['rgba(242,72,34,0.6)', 'rgba(255,255,255,0.6)']}
            style={styles.gradientFrame}
          >
            {pendingChange && (
              <View style={styles.pendingBanner}>
                <Ionicons name="time-outline" size={18} color="#000" />
                <Text style={styles.pendingText}>
                  Pending {pendingChange.type === 'leave' ? 'leave' : 'agency change'} request — waiting
                  for your agent.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.agencyBar}
              activeOpacity={0.85}
              onPress={() => agent && navigation.navigate('PublicProfile', { userId: agent.id })}
            >
              <Text style={styles.agencyLabel}>My agency</Text>
              <View style={styles.agencyRight}>
                {agent && (
                  <UserAvatar
                    user={{
                      displayName: agent.displayName,
                      avatar: agent.avatar,
                      equippedFrame: agent.equippedFrame ?? null,
                    }}
                    size={40}
                  />
                )}
                <Text style={styles.agencyName}>{agent?.displayName ?? 'Independent'}</Text>
                <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
              </View>
            </TouchableOpacity>

            <View style={styles.micCard}>
              <View style={styles.micHeader}>
                <View style={styles.micTitleWrap}>
                  <Text style={styles.micTitle}>
                    {targetHours >= 1
                      ? `Host on Mic for ${targetHours} Hours`
                      : `Host on Mic for ${minutesTarget} mins`}
                  </Text>
                  <View style={styles.helpBadge}>
                    <Text style={styles.helpBadgeText}>?</Text>
                  </View>
                </View>
                <View style={[styles.lockedPill, { backgroundColor: mic?.unlocked ? '#14AE5C' : PRIMARY }]}>
                  <Text style={styles.lockedText}>{mic?.unlocked ? 'Unlocked' : 'Locked'}</Text>
                </View>
              </View>

              <View style={styles.micBody}>
                <View style={styles.micIconWrap}>
                  <MaterialCommunityIcons name="microphone" size={26} color={PRIMARY} />
                </View>
                <View style={styles.micStats}>
                  <View style={styles.micStatLine}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={minutesOnMic >= minutesTarget ? '#14AE5C' : '#000'}
                    />
                    <Text style={styles.micStatText}>
                      {minutesOnMic}/{minutesTarget} mins
                    </Text>
                  </View>
                  <View style={styles.micStatLine}>
                    <Ionicons name="checkmark-circle" size={16} color="#000" />
                    <Text style={styles.micStatText}>
                      {formatK(todayPoints)}/{formatK(pointsTarget)} points
                    </Text>
                  </View>
                  <View style={styles.micStatLine}>
                    <CoinIcon />
                    <Text style={styles.micStatBold}>{currentRate.toLocaleString()}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.incomeRow}>
                <View style={styles.incomeCol}>
                  <View style={styles.labelRow}>
                    <View style={styles.dot} />
                    <Text style={styles.labelText}>Gift Income</Text>
                    <View style={styles.periodPill}>
                      <Text style={styles.periodText}>Last 7 days</Text>
                    </View>
                  </View>
                  <View style={styles.valueRow}>
                    <CoinIcon />
                    <Text style={styles.valueText}>{(week7d?.giftBeans ?? 0).toLocaleString()}</Text>
                  </View>
                </View>
                <View style={styles.incomeCol}>
                  <View style={styles.labelRow}>
                    <View style={styles.dot} />
                    <Text style={styles.labelText}>Hourly Income</Text>
                  </View>
                  <View style={styles.valueRow}>
                    <CoinIcon />
                    <Text style={styles.valueText}>{currentRate}/h</Text>
                  </View>
                </View>
              </View>

              <View style={styles.upgradeBlock}>
                <Text style={styles.upgradeLabel}>Upgrade to</Text>
                <View style={styles.upgradePills}>
                  <UpgradePill value={upgradePill1} filled />
                  <UpgradePill value={upgradePill2} filled={upgradePill2 !== upgradePill1} />
                  <UpgradePill value={upgradePill3} filled={upgradePill3 !== upgradePill2 && upgradePill3 !== upgradePill1} />
                </View>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
                </View>
                <View style={styles.needRow}>
                  <Text style={styles.needLabel}>Still need</Text>
                  <View style={styles.needPill}>
                    <CoinIcon />
                    <Text style={styles.needValue}>{tier?.neededBeans ?? 0}/h</Text>
                  </View>
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity style={styles.ruleBtn}>
                    <Text style={styles.ruleText}>Rule</Text>
                    <Ionicons name="chevron-forward" size={14} color={PRIMARY} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.row2}>
              <StatCard label="Today income" value={today?.totalBeans ?? 0} />
              <StatCard label="Weekly income" value={weekly?.totalBeans ?? 0} />
            </View>

            <View style={styles.wideCard}>
              <Text style={styles.wideLabel}>Time duration (today)</Text>
              <Text style={styles.wideValue}>
                {hoursOnMic}h {minsOnMicRem}m on mic
                {mic?.onMicNow ? ' · live' : ''}
              </Text>
            </View>

            <View style={styles.row2}>
              <ActionBtn label="Become agency" onPress={handleBecomeAgency} />
              <ActionBtn label="Leave agency" onPress={handleLeaveAgency} />
            </View>
            <View style={styles.row2}>
              <ActionBtn
                label="Change agency"
                onPress={() => {
                  if (!agent) {
                    Alert.alert('No agency', 'Join an agency before requesting a change.');
                    return;
                  }
                  if (pendingChange) {
                    Alert.alert('Pending', 'You already have a pending request.');
                    return;
                  }
                  setChangeModalOpen(true);
                }}
              />
              <View style={{ flex: 1 }} />
            </View>

            {official && (
              <TouchableOpacity
                style={styles.contactBar}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('PublicProfile', { userId: official.id })}
              >
                <Text style={styles.contactLabel}>Official contact</Text>
                <View style={styles.contactRight}>
                  <UserAvatar
                    user={{
                      displayName: official.displayName,
                      avatar: official.avatar,
                      equippedFrame: official.equippedFrame ?? null,
                    }}
                    size={36}
                  />
                  <Text style={styles.contactName}>{official.displayName}</Text>
                  <Ionicons name="chevron-forward" size={16} color="#000" />
                </View>
              </TouchableOpacity>
            )}
          </LinearGradient>
        </KeyboardAwareScroll>
      )}
    </View>
  );
}

function CoinIcon() {
  return (
    <View style={styles.coinIcon}>
      <Text style={styles.coinIconText}>$</Text>
    </View>
  );
}

function UpgradePill({ value, filled }: { value: number; filled?: boolean }) {
  return (
    <View style={[styles.upgradePill, filled ? styles.upgradePillFilled : styles.upgradePillDim]}>
      <CoinIcon />
      <Text style={styles.upgradePillText}>{value}/h</Text>
    </View>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValueRow}>
        <CoinIcon />
        <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      </View>
    </View>
  );
}

function ActionBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.85}>
      <Text style={styles.actionText}>{label}</Text>
    </TouchableOpacity>
  );
}

function formatK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: '#FFFFFF',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, color: '#000', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { color: '#666', fontSize: 14 },
  retry: { color: PRIMARY, fontSize: 14, fontWeight: '600' },

  scrollContent: { paddingHorizontal: 10, paddingBottom: 40 },
  gradientFrame: { borderRadius: 15, padding: 10, gap: 14 },

  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,193,7,0.35)',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: GOLD,
  },
  pendingText: { flex: 1, color: '#000', fontSize: 13 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
  modalHint: { fontSize: 13, color: '#555' },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 15,
    color: '#000',
  },
  modalInputMultiline: { minHeight: 72, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  modalBtnGhost: { paddingVertical: 10, paddingHorizontal: 16 },
  modalBtnGhostText: { color: '#666', fontSize: 15, fontWeight: '600' },
  modalBtnPrimary: {
    backgroundColor: PRIMARY,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  modalBtnPrimaryText: { color: '#FFF', fontSize: 15, fontWeight: '600' },

  agencyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: AGENCY_BG,
    borderWidth: 1,
    borderColor: GREEN_BORDER,
    borderRadius: 15,
  },
  agencyLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  agencyRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  agencyName: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },

  micCard: {
    backgroundColor: MIC_CARD_BG,
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 10,
    padding: 12,
    gap: 14,
  },
  micHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  micTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' },
  micBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  micStats: { flex: 1, gap: 2 },
  micIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(95,34,217,0.1)',
  },
  micTitle: { color: '#000', fontSize: 15, fontWeight: '600', flexShrink: 1 },
  helpBadge: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpBadgeText: { color: 'rgba(0,0,0,0.5)', fontSize: 11, fontWeight: '600' },
  micStatLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  micStatText: { color: '#000', fontSize: 13 },
  micStatBold: { color: '#000', fontSize: 14, fontWeight: '600' },

  lockedPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  lockedText: { color: '#FFF', fontSize: 13, fontWeight: '600' },

  incomeRow: { flexDirection: 'row', gap: 12 },
  incomeCol: { flex: 1, gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  dot: { width: 5, height: 5, backgroundColor: PRIMARY },
  labelText: { color: '#000', fontSize: 13, fontWeight: '600' },
  periodPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    backgroundColor: 'rgba(95,34,217,0.2)',
  },
  periodText: { color: '#000', fontSize: 11 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  valueText: { color: '#000', fontSize: 14, fontWeight: '600' },

  upgradeBlock: { gap: 8 },
  upgradeLabel: { color: '#000', fontSize: 13, fontWeight: '500' },
  upgradePills: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  upgradePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 20,
  },
  upgradePillFilled: { backgroundColor: DARK_PURPLE },
  upgradePillDim: { backgroundColor: 'rgba(95,34,217,0.5)' },
  upgradePillText: { color: '#FFF', fontSize: 12, fontWeight: '600' },

  progressBar: {
    height: 8,
    backgroundColor: '#D9D9D9',
    borderRadius: 10,
    overflow: 'hidden',
  },
  progressFill: { height: 8, backgroundColor: PRIMARY, borderRadius: 10 },

  needRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  needLabel: { color: '#000', fontSize: 13 },
  needPill: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  needValue: { color: PRIMARY, fontSize: 13, fontWeight: '600' },
  ruleBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ruleText: { color: PRIMARY, fontSize: 13, fontWeight: '600' },

  row2: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: RED_BORDER,
    borderRadius: 15,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  statLabel: { color: '#000', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  statValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  statValue: { color: '#000', fontSize: 14, fontWeight: '600' },

  wideCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: RED_BORDER,
    borderRadius: 15,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 6,
  },
  wideLabel: { color: '#000', fontSize: 13, fontWeight: '600' },
  wideValue: { color: '#000', fontSize: 15, fontWeight: '600' },

  actionBtn: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: RED_BORDER,
    borderRadius: 15,
    paddingVertical: 11,
    alignItems: 'center',
  },
  actionText: { color: '#000', fontSize: 13, fontWeight: '600' },

  contactBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CONTACT_BG,
    borderWidth: 1,
    borderColor: RED_BORDER,
    borderRadius: 15,
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  contactLabel: { color: '#000', fontSize: 15, fontWeight: '600' },
  contactRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contactName: { color: '#000', fontSize: 14, fontWeight: '600' },

  coinIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F24822',
  },
  coinIconText: { color: '#F24822', fontSize: 10, fontWeight: '800' },
});
