import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';

import {
  hostsApi,
  type LevelTaskStatus,
  type LevelTaskTierRule,
} from '@api/hosts';
import { Spacing } from '@/theme';
import type { RootStackScreenProps } from '@navigation/types';
import type { RootState } from '@store/index';

/** Poll while focused; socket `host:stats_tick` triggers immediate silent refresh */
const LEVEL_TASK_REFRESH_MS = 30_000;

type Props = RootStackScreenProps<'FemaleHostTask'>;
type MainTab = 'regular' | 'activity';
type SubTab = 'live' | 'party';
type MilestoneState = 'locked' | 'claimable' | 'claimed';

const COIN_IMAGE      = require('../../../assets/coin.png');
const TIER_BG_IMAGE   = require('../../../assets/tier-upgrade.png');
const POPPINS = 'Poppins';

/** Color tokens matched directly from the Figma design */
const F = {
  screenBg:     '#F0F0F4',
  sheet:        '#FFFFFF',
  // tabs
  tabActive:    '#000000',
  tabInactive:  'rgba(0,0,0,0.46)',
  tabUnderline: 'rgba(95,34,217,0.76)',
  tabPillBg:    'rgba(217,217,217,0.79)',
  // sub-tabs
  liveActive:   'rgba(0,0,0,0.66)',
  partyInactive:'rgba(0,0,0,0.44)',
  // text
  midText:      'rgba(0,0,0,0.57)',
  valueText:    '#25262B',
  // coin/rupee
  rupeePink:    '#FF4880',
  // pills & buttons
  pillGrey:     'rgba(217,217,217,0.79)',
  goBg:         'rgba(227,143,218,0.79)',
  goText:       '#D806B5',
  // tier boxes
  tierLeftBg:   '#ECC1F4',
  tierLeftRate: '#8755ED',
  // play icon
  playOuter:    'rgba(221,149,245,0.43)',
  playInner:    '#5746F1',
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNum(n: number): string {
  return n.toLocaleString();
}

function fmtDay(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function earningsDateLabel(): string {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  return `${fmtDay(start)}-${fmtDay(end)}`;
}

function resolveCurrentHourlyRate(status: LevelTaskStatus): number {
  if (status.track === 'new_host') return status.rules.newHosts.hourlyBeans;
  if (status.track === 'ordinary') return status.rules.ordinary.liveHourlyBeans;
  const tier = status.rules.tiers.find((t) => t.levelCode === status.levelCode);
  return tier?.incomeTaskHourlyBeans ?? status.rules.ordinary.incomeHourlyBeans;
}

function resolveMilestoneCount(status: LevelTaskStatus): number {
  if (status.track === 'new_host') return status.rules.newHosts.hoursPerDay;
  if (status.track === 'ordinary') return status.rules.ordinary.liveHoursPerDay;
  const tier = status.rules.tiers.find((t) => t.levelCode === status.levelCode);
  return tier?.incomeTaskMaxHoursPerDay ?? 3;
}

/** Beans awarded per income-task claim for the host's current track/tier. */
function resolveIncomeReward(status: LevelTaskStatus): number {
  if (status.track === 'level') {
    const tier = status.rules.tiers.find((t) => t.levelCode === status.levelCode);
    return tier?.incomeTaskHourlyBeans ?? status.rules.ordinary.incomeHourlyBeans;
  }
  return status.rules.ordinary.incomeHourlyBeans;
}

function resolveTargetTier(status: LevelTaskStatus): LevelTaskTierRule | null {
  const sorted = [...status.rules.tiers].sort(
    (a, b) => a.minSevenDayEarnings - b.minSevenDayEarnings,
  );
  if (status.track === 'level') {
    const idx = sorted.findIndex((t) => t.levelCode === status.levelCode);
    return sorted[idx + 1] ?? null;
  }
  return sorted[0] ?? null;
}

/**
 * Browser-tab bar (matches reference image).
 * One white SVG path for the active tab; grey inactive slab behind the other half.
 * Inner S-curve: round-out top → vertical leg → flare at baseline (Frontend Masters pattern).
 */
const NOTEBOOK_TAB = {
  activeH: 54,
  inactiveH: 40,
  /** Corner / S-curve girth (px) */
  girth: 10,
  /** Grey inactive slab extends under the active tab (behind the S-curve) */
  inactiveOverlap: 32,
} as const;

/** Left active tab (Regular): S-curve on the right inner edge at x = tabWidth */
function buildLeftActiveTabPath(tabWidth: number): string {
  const h = NOTEBOOK_TAB.activeH;
  const g = NOTEBOOK_TAB.girth;
  const w = tabWidth;

  return [
    `M 0 ${h}`,
    `Q ${g} ${h} ${g} ${h - g}`,
    `L ${g} ${g}`,
    `Q ${g} 0 ${g * 2} 0`,
    `L ${w - g * 2} 0`,
    `Q ${w - g} ${g} ${w - g} ${g * 2}`,
    `L ${w - g} ${h - g}`,
    `Q ${w - g} ${h} ${w} ${h}`,
    'Z',
  ].join(' ');
}

/** Right active tab (Activity): S-curve on the left inner edge at x = offset */
function buildRightActiveTabPath(barWidth: number, tabWidth: number): string {
  const h = NOTEBOOK_TAB.activeH;
  const g = NOTEBOOK_TAB.girth;
  const o = barWidth - tabWidth;
  const w = o + tabWidth;

  return [
    `M ${w} ${h}`,
    `Q ${w - g} ${h} ${w - g} ${h - g}`,
    `L ${w - g} ${g}`,
    `Q ${w - g} 0 ${w - g * 2} 0`,
    `L ${o + g * 2} 0`,
    `Q ${o + g} ${g} ${o + g} ${g * 2}`,
    `L ${o + g} ${h - g}`,
    `Q ${o + g} ${h} ${o} ${h}`,
    'Z',
  ].join(' ');
}

interface Milestone {
  index: number;
  threshold: number;
  currentMinutes: number;
  hourlyRate: number;
  state: MilestoneState;
}

function buildMilestones(status: LevelTaskStatus): Milestone[] {
  const count = resolveMilestoneCount(status);
  const hourlyRate = resolveCurrentHourlyRate(status);
  const milestones: Milestone[] = [];
  for (let i = 0; i < count; i++) {
    const threshold = 60 * (i + 1);
    const currentMinutes = Math.min(status.todayMicMinutes, threshold);
    const claimed = status.liveMinutesClaimed >= threshold;
    const achieved = status.todayMicMinutes >= threshold;
    milestones.push({
      index: i,
      threshold,
      currentMinutes,
      hourlyRate,
      state: claimed ? 'claimed' : achieved ? 'claimable' : 'locked',
    });
  }
  return milestones.reverse(); // highest threshold first (180 → 120 → 60)
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

/** Pink ₹ coin icon */
function RupeeIcon({ size = 18 }: { size?: number }) {
  return (
    <View style={[s.rupeeOuter, { width: size, height: size, borderRadius: size / 2 }]}>
      <View
        style={[
          s.rupeeInner,
          { width: size * 0.88, height: size * 0.88, borderRadius: size / 2 },
        ]}
      >
        <Text style={[s.rupeeSymbol, { fontSize: size * 0.55 }]}>₹</Text>
      </View>
    </View>
  );
}

/** Rupee icon + value */
function MoneyRow({ amount, iconSize = 16 }: { amount: string; iconSize?: number }) {
  return (
    <View style={s.moneyRow}>
      <RupeeIcon size={iconSize} />
      <Text style={s.moneyValue}>{amount}</Text>
    </View>
  );
}

/** Purple play circle */
function PlayCircle() {
  return (
    <View style={s.playOuter}>
      <View style={s.playInner}>
        <Ionicons name="play" size={14} color="#FFFFFF" style={{ marginLeft: 2 }} />
      </View>
    </View>
  );
}

// ─── Screen sections ──────────────────────────────────────────────────────────

/**
 * White card at top — "Today's Task Earnings"
 * Left column: pink rupee coin + live-beans value
 * Right column: gold coin image + income-beans value
 */
function TodaysTaskEarnings({ status }: { status: LevelTaskStatus | null }) {
  const liveToday   = status?.liveBeansClaimedToday   ?? 0;
  const incomeToday = status?.incomeBeansClaimedToday ?? 0;

  return (
    <View style={s.todayCard}>
      <Text style={s.todayTitle}>Today's Task Earnings</Text>
      <View style={s.todayRow}>
        {/* Left: pink rupee + live beans */}
        <View style={s.todayCol}>
          <MoneyRow amount={formatNum(liveToday)} iconSize={20} />
        </View>

        <View style={s.todayDivider} />

        {/* Right: gold coin + income beans */}
        <View style={s.todayCol}>
          <Image source={COIN_IMAGE} style={s.todayCoinImg} contentFit="contain" />
          <Text style={s.moneyValue}>{formatNum(incomeToday)}</Text>
        </View>
      </View>
    </View>
  );
}

/** Purple gradient banner */
function LevelTaskBanner() {
  return (
    <LinearGradient
      colors={['#7B4FFF', '#5A2ECC']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={s.banner}
    >
      <Text style={s.bannerTitle}>New Level Task</Text>
      <View style={s.bannerDecor} pointerEvents="none">
        <Text style={s.pumpkin}>🎃</Text>
        <Text style={[s.pumpkin, { fontSize: 34 }]}>🎃</Text>
      </View>
    </LinearGradient>
  );
}

/** Regular | Activity — white active SVG on top; wider grey slab behind, overlapping the junction */
function MainTabBar({
  active,
  onSelect,
}: {
  active: MainTab;
  onSelect: (t: MainTab) => void;
}) {
  const [barWidth, setBarWidth] = useState(0);
  const isRegular = active === 'regular';
  const half = barWidth / 2;
  const { activeH, inactiveH, inactiveOverlap } = NOTEBOOK_TAB;
  const inactiveSlabWidth = barWidth > 0 ? half + inactiveOverlap : 0;

  const whitePath =
    barWidth > 0
      ? isRegular
        ? buildLeftActiveTabPath(half)
        : buildRightActiveTabPath(barWidth, half)
      : '';

  return (
    <View
      style={s.mainTabBar}
      onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
    >
      {/* Inactive grey: shorter + lower than active, still overlaps behind the S-curve */}
      {inactiveSlabWidth > 0 ? (
        <View
          style={[
            s.mainTabInactiveSlab,
            {
              width: inactiveSlabWidth,
              height: inactiveH,
              bottom: 0,
            },
            isRegular ? s.mainTabInactiveRight : s.mainTabInactiveLeft,
          ]}
          pointerEvents="none"
        />
      ) : null}

      {barWidth > 0 ? (
        <Svg
          width={barWidth}
          height={activeH}
          style={s.mainTabSvgOverlay}
          viewBox={`0 0 ${barWidth} ${activeH}`}
          pointerEvents="none"
        >
          <Path d={whitePath} fill={F.sheet} />
        </Svg>
      ) : null}

      <TouchableOpacity
        style={s.mainTabHit}
        onPress={() => onSelect('regular')}
        activeOpacity={0.85}
      >
        <View style={[s.mainTabLabelWrap, isRegular ? s.mainTabLabelWrapActive : s.mainTabLabelWrapInactive]}>
          <Text style={[s.mainTabLabel, isRegular && s.mainTabLabelActive]}>Regular</Text>
          {isRegular ? <View style={s.mainTabUnderline} /> : null}
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={s.mainTabHit}
        onPress={() => onSelect('activity')}
        activeOpacity={0.85}
      >
        <View style={[s.mainTabLabelWrap, !isRegular ? s.mainTabLabelWrapActive : s.mainTabLabelWrapInactive]}>
          <Text style={[s.mainTabLabel, !isRegular && s.mainTabLabelActive]}>Activity</Text>
          {!isRegular ? <View style={s.mainTabUnderline} /> : null}
        </View>
      </TouchableOpacity>
    </View>
  );
}

/** Live | Party sub-tab strip (inside Regular) */
function SubTabBar({
  active,
  onSelect,
}: {
  active: SubTab;
  onSelect: (t: SubTab) => void;
}) {
  return (
    <View style={s.subTabBar}>
      <TouchableOpacity
        style={[s.subTabBtn, active === 'live' && s.subTabBtnActive]}
        onPress={() => onSelect('live')}
      >
        <Text
          style={[
            s.subTabLabel,
            active === 'live' ? s.subTabLabelActive : s.subTabLabelInactive,
          ]}
        >
          Live
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={s.subTabPartyBtn}
        onPress={() => onSelect('party')}
      >
        <Text
          style={[
            s.subTabLabel,
            active === 'party' ? s.subTabLabelActive : s.subTabLabelInactive,
          ]}
        >
          Party
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Lavender-gradient card:
 *   Earnings date range + total
 *   Hourly wage + dropdown pill
 *   Still need
 *   Tier upgrade visual (left: current, right: target)
 */
function EarningsWageCard({ status }: { status: LevelTaskStatus }) {
  const currentRate = resolveCurrentHourlyRate(status);
  const targetTier  = resolveTargetTier(status);
  const targetRate  = targetTier?.incomeTaskHourlyBeans ?? currentRate;
  const stillNeed   = targetTier
    ? Math.max(0, targetTier.minSevenDayEarnings - status.sevenDayEarnings)
    : 0;

  return (
    <LinearGradient
      colors={['#FFFFFF', 'rgba(218,158,237,0.75)', 'rgba(182,61,218,0.5)']}
      locations={[0, 0.91, 1]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={s.earningsCard}
    >
      {/* Row 1: date range earnings */}
      <View style={s.ewRow}>
        <Text style={s.midText}>{earningsDateLabel()} Earnings:</Text>
        <MoneyRow amount={formatNum(status.sevenDayEarnings)} iconSize={16} />
      </View>

      {/* Row 2: hourly wage + dropdown pill */}
      <View style={s.ewRow}>
        <Text style={s.wageLabel}>Hourly wage</Text>
        <View style={s.wagePill}>
          <RupeeIcon size={16} />
          <Text style={s.wagePillText}>{formatNum(targetRate)}/h</Text>
          <Ionicons name="chevron-down" size={12} color="#000" />
        </View>
      </View>

      {/* Row 3: still need */}
      <View style={s.ewStillNeed}>
        <Text style={s.midText}>Still need</Text>
        <MoneyRow amount={formatNum(stillNeed)} iconSize={14} />
      </View>

      {/* Tier upgrade — Group 159.png as background, rate text overlaid */}
      <View style={s.tierContainer}>
        {/* Background image: left lavender + white arrow + right purple gradient */}
        <Image
          source={TIER_BG_IMAGE}
          style={s.tierBgImage}
          contentFit="fill"
        />

        {/* Left overlay: current rate */}
        <View style={s.tierLeftOverlay} pointerEvents="none">
          <RupeeIcon size={34} />
          <Text style={s.tierRateLeft}>{formatNum(currentRate)}/h</Text>
        </View>

        {/* Right overlay: target rate */}
        <View style={s.tierRightOverlay} pointerEvents="none">
          <RupeeIcon size={46} />
          <Text style={s.tierRateRight}>{formatNum(targetRate)}/h</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

/**
 * Single task milestone row:
 *   [PlayCircle] [title + progress + reward pill]  [GO> / Claim / Done]
 */
function TaskRow({
  milestone,
  claiming,
  onClaim,
  onGo,
}: {
  milestone: Milestone;
  claiming: boolean;
  onClaim: () => void;
  onGo: () => void;
}) {
  return (
    <View style={s.taskRow}>
      <PlayCircle />

      <View style={s.taskBody}>
        <Text style={s.taskTitle} numberOfLines={1}>
          Daily Live duration&gt; {milestone.threshold} minutes
        </Text>
        <Text style={s.taskProgress}>
          ({milestone.currentMinutes}/{milestone.threshold})
        </Text>
        <View style={s.rewardPill}>
          <RupeeIcon size={14} />
          <Text style={s.rewardPillText}>+{formatNum(milestone.hourlyRate)}/h</Text>
        </View>
      </View>

      {milestone.state === 'claimed' ? (
        <View style={s.goBtn}>
          <Text style={[s.goBtnText, { color: F.tabActive }]}>Done</Text>
        </View>
      ) : milestone.state === 'claimable' ? (
        <TouchableOpacity style={s.goBtn} onPress={onClaim} disabled={claiming}>
          {claiming ? (
            <ActivityIndicator size="small" color={F.goText} />
          ) : (
            <Text style={s.goBtnText}>Claim</Text>
          )}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={s.goBtn} onPress={onGo} activeOpacity={0.85}>
          <Text style={s.goBtnText}>GO&gt;</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/**
 * Income / gift-earnings task row.
 * Progress = today's gift earnings toward the income threshold; claimable when the
 * backend says so (`canClaimIncome`). Mirrors the live TaskRow visual.
 */
function IncomeTaskRow({
  status,
  claiming,
  onClaim,
  onGo,
}: {
  status: LevelTaskStatus;
  claiming: boolean;
  onClaim: () => void;
  onGo: () => void;
}) {
  const threshold = status.rules.incomeThresholdBeans;
  const current   = Math.min(status.todayGiftEarnings, threshold);
  const reward    = resolveIncomeReward(status);
  const exhausted = status.todayGiftEarnings >= threshold && status.incomeClaimsRemaining <= 0;

  return (
    <View style={s.taskRow}>
      <PlayCircle />

      <View style={s.taskBody}>
        <Text style={s.taskTitle} numberOfLines={1}>
          Daily Income&gt; {formatNum(threshold)} beans
        </Text>
        <Text style={s.taskProgress}>
          ({formatNum(current)}/{formatNum(threshold)})
        </Text>
        <View style={s.rewardPill}>
          <RupeeIcon size={14} />
          <Text style={s.rewardPillText}>+{formatNum(reward)}/claim</Text>
        </View>
      </View>

      {exhausted ? (
        <View style={s.goBtn}>
          <Text style={[s.goBtnText, { color: F.tabActive }]}>Done</Text>
        </View>
      ) : status.canClaimIncome ? (
        <TouchableOpacity style={s.goBtn} onPress={onClaim} disabled={claiming}>
          {claiming ? (
            <ActivityIndicator size="small" color={F.goText} />
          ) : (
            <Text style={s.goBtnText}>Claim</Text>
          )}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={s.goBtn} onPress={onGo} activeOpacity={0.85}>
          <Text style={s.goBtnText}>GO&gt;</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** Activity tab content — weekly income rows */
function ActivityContent() {
  const [income, setIncome] = useState<{
    giftBeans: number;
    micBeans: number;
    totalBeans: number;
    minutesOnMic: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      hostsApi
        .getIncome('weekly')
        .then((d) => {
          if (active) { setIncome(d); setLoading(false); }
        })
        .catch(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }, []),
  );

  if (loading) {
    return <ActivityIndicator style={s.activityLoader} color="#7B4FFF" />;
  }
  if (!income) {
    return <Text style={[s.midText, s.activityEmpty]}>No activity data</Text>;
  }

  const rows = [
    { label: 'Weekly Gift Earnings', value: formatNum(income.giftBeans),  bean: true },
    { label: 'Weekly Mic Earnings',  value: formatNum(income.micBeans),   bean: true },
    { label: 'Total This Week',      value: formatNum(income.totalBeans), bean: true },
    { label: 'Minutes on Mic',       value: `${income.minutesOnMic} min`, bean: false },
  ];

  return (
    <View style={s.activityCard}>
      {rows.map((row, idx) => (
        <View key={row.label}>
          <View style={s.activityRow}>
            <Text style={s.midText}>{row.label}</Text>
            {row.bean ? (
              <MoneyRow amount={row.value} iconSize={14} />
            ) : (
              <Text style={s.moneyValue}>{row.value}</Text>
            )}
          </View>
          {idx < rows.length - 1 && <View style={s.activityDivider} />}
        </View>
      ))}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function FemaleHostTaskScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const lastHostCenterTickAt = useSelector((s: RootState) => s.auth.lastHostCenterTickAt);
  const [mainTab,    setMainTab]    = useState<MainTab>('regular');
  const [subTab,     setSubTab]     = useState<SubTab>('live');
  const [status,     setStatus]     = useState<LevelTaskStatus | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [claimingIdx, setClaimingIdx] = useState<number | null>(null);
  const [claimingIncome, setClaimingIncome] = useState(false);
  const loadSeq = useRef(0);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const seq = ++loadSeq.current;
    if (!opts?.silent) setLoading(true);
    try {
      const data = await hostsApi.getLevelTask();
      if (seq !== loadSeq.current) return;
      setStatus(data);
    } catch (e: unknown) {
      if (!opts?.silent) {
        Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load tasks');
      }
    } finally {
      if (seq === loadSeq.current && !opts?.silent) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      const interval = setInterval(() => {
        void load({ silent: true });
      }, LEVEL_TASK_REFRESH_MS);
      return () => clearInterval(interval);
    }, [load]),
  );

  useEffect(() => {
    if (lastHostCenterTickAt == null) return;
    void load({ silent: true });
  }, [lastHostCenterTickAt, load]);

  const handleClaim = useCallback(async (milestoneIndex: number) => {
    setClaimingIdx(milestoneIndex);
    try {
      const { beansAwarded } = await hostsApi.claimLevelTaskLive();
      Alert.alert(
        'Reward Claimed!',
        `+${formatNum(beansAwarded)} beans added to your wallet.`,
        [{ text: 'OK', onPress: () => load({ silent: true }) }],
      );
    } catch (e: unknown) {
      Alert.alert('Claim failed', e instanceof Error ? e.message : 'Error');
    } finally {
      setClaimingIdx(null);
    }
  }, [load]);

  const handleClaimIncome = useCallback(async () => {
    setClaimingIncome(true);
    try {
      const { beansAwarded } = await hostsApi.claimLevelTaskIncome();
      Alert.alert(
        'Reward Claimed!',
        `+${formatNum(beansAwarded)} beans added to your wallet.`,
        [{ text: 'OK', onPress: () => load({ silent: true }) }],
      );
    } catch (e: unknown) {
      Alert.alert('Claim failed', e instanceof Error ? e.message : 'Error');
    } finally {
      setClaimingIncome(false);
    }
  }, [load]);

  const milestones = status ? buildMilestones(status) : [];

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.headerIconBtn}
          onPress={() => navigation.goBack()}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={26} color={F.tabActive} />
        </TouchableOpacity>

        <Text style={s.headerTitle}>Reward</Text>

        <TouchableOpacity
          style={s.headerIconBtn}
          onPress={() => navigation.navigate('NewLevelTask')}
          hitSlop={12}
        >
          <Ionicons name="help-circle-outline" size={24} color={F.tabActive} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      >
        {/* ── Above-fold: earnings card + banner ─────────────────────────── */}
        <View style={s.aboveFold}>
          <TodaysTaskEarnings status={status} />
          <LevelTaskBanner />
        </View>

        {/* Tab bar on grey bg — SVG S-curve on active tab inner edge */}
        <MainTabBar active={mainTab} onSelect={setMainTab} />

        {/*
         * ── White content sheet — NO top border radius.
         *    The active tab's white background connects flush to this,
         *    making them look like one continuous white shape.
         */}
        <View style={s.tabSheet}>

          {/* ── Activity tab ──────────────────────────────────────────────── */}
          {mainTab === 'activity' ? (
            <ActivityContent />

          /* ── Regular tab ──────────────────────────────────────────────── */
          ) : (
            <>
              <SubTabBar active={subTab} onSelect={setSubTab} />

              {loading ? (
                <ActivityIndicator style={{ marginTop: 40 }} color="#7B4FFF" />

              ) : subTab === 'party' ? (
                <Text style={s.emptyText}>No party tasks available yet.</Text>

              ) : !status ? (
                <Text style={s.emptyText}>No task data available.</Text>

              ) : (
                <>
                  <EarningsWageCard status={status} />
                  <View style={s.taskList}>
                    {milestones.map((m) => (
                      <TaskRow
                        key={m.index}
                        milestone={m}
                        claiming={claimingIdx === m.index}
                        onClaim={() => handleClaim(m.index)}
                        onGo={() => navigation.navigate('CreateRoom')}
                      />
                    ))}
                    {status.track !== 'new_host' ? (
                      <IncomeTaskRow
                        status={status}
                        claiming={claimingIncome}
                        onClaim={handleClaimIncome}
                        onGo={() => navigation.navigate('CreateRoom')}
                      />
                    ) : null}
                  </View>
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({

  // ── Screen
  screen: {
    flex: 1,
    backgroundColor: F.screenBg,
  },

  // ── Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: POPPINS,
    fontSize: 18,
    fontWeight: '700',
    color: F.tabActive,
    textAlign: 'center',
  },

  // ── ScrollView
  scroll: { flexGrow: 1 },

  // ── Above-fold (grey bg area)
  aboveFold: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing.md,
  },

  // ── Today's Task Earnings card
  todayCard: {
    backgroundColor: F.sheet,
    borderRadius: 12,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  todayTitle: {
    fontFamily: POPPINS,
    fontSize: 11,
    fontWeight: '500',
    color: F.midText,
    marginBottom: 8,
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  todayCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  todayDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#E0E0E0',
  },
  todayCoinImg: { width: 20, height: 20 },

  // ── Banner
  banner: {
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: Spacing.lg,
    overflow: 'hidden',
    minHeight: 70,
    justifyContent: 'center',
  },
  bannerTitle: {
    fontFamily: POPPINS,
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  bannerDecor: {
    position: 'absolute',
    right: 8,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  pumpkin: { fontSize: 40 },

  // ── White content sheet
  // NO top border radius — the active tab's white bg connects flush to this,
  // making them appear as one continuous white shape (the notebook-tab body).
  tabSheet: {
    flex: 1,
    backgroundColor: F.sheet,
    paddingBottom: Spacing.xl,
  },

  // ── Main tab bar — grey inactive behind, white active SVG on top
  mainTabBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: NOTEBOOK_TAB.activeH,
    position: 'relative',
    overflow: 'visible',
  },
  mainTabInactiveSlab: {
    position: 'absolute',
    backgroundColor: F.tabPillBg,
    zIndex: 0,
    elevation: 0,
  },
  mainTabInactiveRight: {
    right: 0,
    borderTopRightRadius: 20,
  },
  mainTabInactiveLeft: {
    left: 0,
    borderTopLeftRadius: 20,
  },
  mainTabSvgOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 1,
    elevation: 2,
  },
  mainTabHit: {
    flex: 1,
    height: NOTEBOOK_TAB.activeH,
    justifyContent: 'flex-end',
    zIndex: 3,
  },
  mainTabLabelWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 10,
  },
  mainTabLabelWrapActive: {
    paddingTop: 12,
  },
  mainTabLabelWrapInactive: {
    paddingTop: NOTEBOOK_TAB.activeH - NOTEBOOK_TAB.inactiveH + 4,
  },
  mainTabLabel: {
    fontFamily: POPPINS,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
    color: F.tabInactive,
  },
  mainTabLabelActive: {
    color: F.tabActive,
    fontWeight: '700',
  },
  /** Short purple underline bar below the active tab text */
  mainTabUnderline: {
    width: 34,
    height: 3,
    borderRadius: 99,
    backgroundColor: F.tabUnderline,
    marginTop: 4,
  },

  // ── Sub-tabs (Live | Party)
  subTabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.lg,
  },
  subTabBtn: {
    paddingVertical: 5,
    paddingHorizontal: 16,
    borderRadius: 40,
  },
  /** Active sub-tab: white pill with subtle shadow + border */
  subTabBtnActive: {
    backgroundColor: F.sheet,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.18)',
    shadowColor: '#D9D9D9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 3,
  },
  subTabPartyBtn: {
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  subTabLabel: {
    fontFamily: POPPINS,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
  },
  subTabLabelActive:   { color: F.liveActive },
  subTabLabelInactive: { color: F.partyInactive },

  // ── Earnings / Wage card (lavender gradient)
  earningsCard: {
    borderRadius: 12,
    marginHorizontal: Spacing.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    shadowColor: 'rgba(217,217,217,0.96)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 3,
  },
  ewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  wageLabel: {
    fontFamily: POPPINS,
    fontSize: 16,
    fontWeight: '700',
    color: F.tabActive,
  },
  wagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: F.pillGrey,
    borderRadius: 8,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  wagePillText: {
    fontFamily: POPPINS,
    fontSize: 14,
    fontWeight: '500',
    color: F.valueText,
  },
  ewStillNeed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },

  // ── Tier upgrade image + text overlay
  tierContainer: {
    position: 'relative',
    width: '100%',
    height: 100,
    borderRadius: 14,
    overflow: 'hidden',
  },
  tierBgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  /** Left half: current tier rate text, centred over the lavender side */
  tierLeftOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '45%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  /** Right half: target tier rate text, centred over the purple side */
  tierRightOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: '50%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tierRateLeft: {
    fontFamily: POPPINS,
    fontSize: 14,
    fontWeight: '800',
    color: F.tierLeftRate,
  },
  tierRateRight: {
    fontFamily: POPPINS,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── Task list
  taskList: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  taskBody: { flex: 1 },
  taskTitle: {
    fontFamily: POPPINS,
    fontSize: 14,
    fontWeight: '700',
    color: F.tabActive,
    lineHeight: 20,
  },
  taskProgress: {
    fontFamily: POPPINS,
    fontSize: 12,
    color: F.midText,
    lineHeight: 18,
  },
  rewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: F.pillGrey,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  rewardPillText: {
    fontFamily: POPPINS,
    fontSize: 12,
    fontWeight: '600',
    color: F.valueText,
  },
  goBtn: {
    backgroundColor: F.goBg,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  goBtnText: {
    fontFamily: POPPINS,
    fontSize: 14,
    fontWeight: '700',
    color: F.goText,
  },

  // ── Play icon
  playOuter: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: F.playOuter,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: F.playInner,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Activity tab
  activityCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    backgroundColor: F.sheet,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(217,217,217,0.9)',
    shadowColor: '#D9D9D9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 3,
    overflow: 'hidden',
  },
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
  },
  activityDivider: {
    height: 1,
    backgroundColor: 'rgba(217,217,217,0.7)',
    marginHorizontal: Spacing.md,
  },
  activityLoader: { marginTop: Spacing.xl },
  activityEmpty:  { textAlign: 'center', marginTop: Spacing.xl },

  // ── Shared text / coin
  midText: {
    fontFamily: POPPINS,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
    color: F.midText,
  },
  moneyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  moneyValue: {
    fontFamily: POPPINS,
    fontSize: 14,
    fontWeight: '600',
    color: F.valueText,
  },
  emptyText: {
    fontFamily: POPPINS,
    fontSize: 14,
    fontWeight: '600',
    color: F.midText,
    textAlign: 'center',
    marginTop: 48,
    paddingHorizontal: Spacing.xl,
  },

  // ── Rupee coin icon
  rupeeOuter: {
    backgroundColor: '#FFADC8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rupeeInner: {
    backgroundColor: '#FF4880',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rupeeSymbol: {
    color: '#FFFFFF',
    fontWeight: '400',
    opacity: 0.9,
  },
});
