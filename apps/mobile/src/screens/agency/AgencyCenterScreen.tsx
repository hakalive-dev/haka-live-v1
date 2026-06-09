import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  Dimensions,
  useWindowDimensions,
} from "react-native";
import Svg, {
  Polyline,
  Line,
  Circle,
  Path,
  Text as SvgText,
} from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAgencyCenterQuery } from "@hooks/queries/useAgencyCenterQuery";
import { useRefetchOnFocusIfStale } from "@hooks/useRefetchOnFocusIfStale";
import { queryClient } from "@api/queryClient";
import { queryKeys } from "@api/queryKeys";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useSelector } from "react-redux";

import { agencyApi } from "@api/agency";
import { hostApplicationApi } from "@api/hostApplication";
import { Colors, Radius, Spacing } from "@/theme";
import { DetailSkeleton } from "@components/Skeleton";
import type {
  AgencySummary,
  AgencySummaryV2,
  AgencyDailyAnalytics,
  AgencyHost,
  AgencyTierInfo,
  AgencyLearnPromotion,
} from "@/types";
import type { RootStackScreenProps } from "@navigation/types";
import type { RootState } from "@store/index";
import { canAccessLevelTask } from "@/utils/levelTaskEligibility";

type Props = RootStackScreenProps<"AgencyCenter">;

const TOP_TABS = ["Make Money", "Manage", "Data"] as const;
type TopTab = (typeof TOP_TABS)[number];

/** Same ladder as backend seed / admin defaults — shown when API returns fewer than 2 tiers so labels (0%, 5%, …) still render. */
const DEFAULT_GIFT_BONUS_DISPLAY_TIERS: Array<{
  name: string;
  bonusRate: number;
  minRollingIncome: string;
}> = [
  { name: "Tier1", bonusRate: 0, minRollingIncome: "0" },
  { name: "Tier2", bonusRate: 0.05, minRollingIncome: "200000" },
  { name: "Tier3", bonusRate: 0.1, minRollingIncome: "300000" },
  { name: "Tier4", bonusRate: 0.15, minRollingIncome: "500000" },
];

function fmtBigInt(s: string): string {
  try {
    return BigInt(s).toLocaleString();
  } catch {
    return s;
  }
}

/** Tier ladder thresholds (host income / rolling income) — same rules as gift-bonus card */
function fmtTierIncomeThreshold(s: string): string {
  try {
    const n = Number(s);
    if (n === 0) return "0";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return n.toString();
  } catch {
    return s;
  }
}

function rollingAgencyHostIncomeIsZero(
  rollingIncome: string | undefined | null,
): boolean {
  if (rollingIncome == null || rollingIncome.trim() === "") return true;
  try {
    return BigInt(rollingIncome) <= 0n;
  } catch {
    return true;
  }
}

/** When on the ladder at the first step, API progress is 0% — nudge width so the fill reads on screen. */
function tierFillDisplayPercent(progress: number, currentIdx: number): number {
  if (currentIdx < 0) return progress;
  if (progress >= 8) return progress;
  return Math.max(progress, 8);
}

const TIER_DOT_RADIUS = 6;

/** Dot anchor along the full-width track (0% … 100%). */
function tierLadderAnchorPercent(index: number, tierCount: number): number {
  if (tierCount <= 1) return 0;
  return (index / (tierCount - 1)) * 100;
}

function tierLadderLabelSlotWidth(trackWidth: number, tierCount: number): number {
  if (trackWidth <= 0 || tierCount <= 1) return 56;
  return Math.max(44, Math.floor(trackWidth / (tierCount - 1)));
}

/** Center a label row item on its dot anchor (translateX −50%). */
function tierLadderCenteredMarkerStyle(
  index: number,
  tierCount: number,
  slotWidth: number,
): {
  left: `${number}%`;
  width: number;
  marginLeft: number;
  alignItems: "center";
} {
  const pct = tierLadderAnchorPercent(index, tierCount);
  return {
    left: `${pct}%`,
    width: slotWidth,
    marginLeft: -slotWidth / 2,
    alignItems: "center",
  };
}

function tierLadderDotMarkerStyle(index: number, tierCount: number) {
  const pct = tierLadderAnchorPercent(index, tierCount);
  return {
    left: `${pct}%` as const,
    marginLeft: -TIER_DOT_RADIUS,
  };
}

/** Full-width tier track; % and coin values centered on each dot. */
function TierLadderSection<T extends { name: string }>({
  tiers,
  activeTierName,
  fillPercent,
  currentIdx,
  pctLabel,
  thresholdLabel,
}: {
  tiers: T[];
  activeTierName: string;
  fillPercent: number;
  currentIdx: number;
  pctLabel: (tier: T) => string;
  thresholdLabel: (tier: T) => string;
}) {
  const n = tiers.length;
  const { width: windowWidth } = useWindowDimensions();
  const compact = windowWidth < 380;
  const [trackWidth, setTrackWidth] = useState(0);

  const onTrackLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number } } }) => {
      const w = Math.round(e.nativeEvent.layout.width);
      setTrackWidth((prev) => (prev === w ? prev : w));
    },
    [],
  );

  const labelSlotWidth = tierLadderLabelSlotWidth(trackWidth, n);

  return (
    <View style={styles.tierSection} onLayout={onTrackLayout}>
      <View style={[styles.tierMarkersRow, styles.tierMarkersRowPct]}>
        {tiers.map((t, i) => {
          const isActive = t.name === activeTierName;
          return (
            <View
              key={`pct-${t.name}`}
              style={[
                styles.tierMarker,
                tierLadderCenteredMarkerStyle(i, n, labelSlotWidth),
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.tierLabel,
                  compact && styles.tierLabelCompact,
                  isActive && styles.tierLabelActive,
                ]}
              >
                {pctLabel(t)}
              </Text>
            </View>
          );
        })}
      </View>

      <View
        style={styles.tierTrackWrapper}
        collapsable={Platform.OS === "android" ? false : undefined}
      >
        <View style={styles.tierTrack}>
          <View
            style={[
              styles.tierFill,
              { width: `${Math.min(100, fillPercent)}%` },
            ]}
          />
        </View>
        {tiers.map((t, i) => {
          const reached = i <= currentIdx;
          return (
            <View
              key={`dot-${t.name}`}
              style={[styles.tierDotMarker, tierLadderDotMarkerStyle(i, n)]}
              pointerEvents="none"
            >
              <View
                style={[styles.tierDot, reached && styles.tierDotActive]}
              />
            </View>
          );
        })}
      </View>

      <View style={styles.tierMarkersRow}>
        {tiers.map((t, i) => (
          <View
            key={`thr-${t.name}`}
            style={[
              styles.tierMarker,
              tierLadderCenteredMarkerStyle(i, n, labelSlotWidth),
            ]}
          >
            <View
              style={[
                styles.tierThresholdCell,
                compact && styles.tierThresholdCellCompact,
              ]}
            >
              <Image
                source={require("../../../assets/coin.png")}
                style={[styles.tierCoin, compact && styles.tierCoinCompact]}
                contentFit="contain"
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.tierThresholdLabel,
                  compact && styles.tierThresholdLabelCompact,
                ]}
              >
                {thresholdLabel(t)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Track fill 0–100% from rolling 7-day gift income, linear between tier thresholds (same x-axis as evenly spaced dots).
 */
function giftBonusIncomeTrackFillPercent(
  rollingIncome: string | undefined | null,
  tiers: Array<{ minRollingIncome: string }>,
): number {
  if (tiers.length < 2) return 0;

  let income: bigint;
  try {
    income = BigInt(rollingIncome ?? "0");
  } catch {
    income = 0n;
  }
  if (income <= 0n) return 0;

  const sorted = [...tiers].sort((a, b) => {
    try {
      const da = BigInt(a.minRollingIncome);
      const db = BigInt(b.minRollingIncome);
      if (da < db) return -1;
      if (da > db) return 1;
      return 0;
    } catch {
      return 0;
    }
  });

  const mins: bigint[] = [];
  for (const t of sorted) {
    try {
      mins.push(BigInt(t.minRollingIncome));
    } catch {
      mins.push(0n);
    }
  }

  const n = mins.length;
  const last = mins[n - 1]!;
  if (income >= last) return 100;

  const first = mins[0]!;
  if (income < first) return 0;

  for (let j = 0; j < n - 1; j++) {
    const low = mins[j]!;
    const high = mins[j + 1]!;
    const atLastSegment = j === n - 2;
    const inSegment = atLastSegment
      ? income >= low && income <= high
      : income >= low && income < high;
    if (!inSegment) continue;

    const denom = high - low;
    const frac = denom === 0n ? 1 : Number(income - low) / Number(denom);
    const pct = ((j + frac) / (n - 1)) * 100;
    return Math.min(100, Math.max(0, pct));
  }

  return 0;
}

/**
 * Gift-bonus ladder footer; aligns with GET /agency/summary (AgencySummaryV2):
 * currentGiftBonusTier, nextGiftBonusTier, allGiftBonusTiers, effectiveGiftBonusRate.
 */
function giftBonusLadderFooterNote(
  summaryV2: AgencySummaryV2 | null,
  giftBonusDisplayTiers: Array<{
    name: string;
    bonusRate: number;
    minRollingIncome: string;
  }>,
  currentGiftBonusIdx: number,
  serverGiftBonusTierCount: number,
): string {
  if (!summaryV2) {
    return "Connect and refresh to see your gift bonus tier status.";
  }
  if (serverGiftBonusTierCount < 2) {
    return "Standard 0%, 5%, 10%, and 15% bonus steps (reference). Your tier list is not on the server yet — configure gift bonus tiers in admin or refresh after setup.";
  }
  const lastIdx = giftBonusDisplayTiers.length - 1;
  if (currentGiftBonusIdx >= 0 && currentGiftBonusIdx === lastIdx) {
    return "Has reached the highest ratio";
  }
  if (currentGiftBonusIdx >= 0 && summaryV2.nextGiftBonusTier) {
    const next = summaryV2.nextGiftBonusTier;
    const pct = Math.round(Number(next.bonusRate ?? 0) * 100);
    return `Next tier: ${pct}% bonus at ${fmtTierIncomeThreshold(next.minRollingIncome)} beans (7-day gift income).`;
  }
  if (currentGiftBonusIdx >= 0) {
    return "Earn more 7-day gift income to reach the next bonus tier.";
  }
  if (summaryV2.effectiveGiftBonusRate > 0) {
    return `You use a fixed ${Math.round(summaryV2.effectiveGiftBonusRate * 100)}% gift bonus; the ladder shows reference thresholds only.`;
  }
  return "Gift bonus is inactive; when enabled, host gift income unlocks higher tiers.";
}

/** Commission ladder footer (modal); uses AgencySummary tier fields from the same summary endpoint. */
function commissionLadderFooterNote(
  summary: AgencySummary,
  commissionTiers: AgencyTierInfo[],
  currentCommissionIdx: number,
): string {
  if (commissionTiers.length < 2) {
    return "Commission tiers are not available.";
  }
  const lastIdx = commissionTiers.length - 1;
  if (currentCommissionIdx >= 0 && currentCommissionIdx === lastIdx) {
    return "Has reached the highest ratio";
  }
  if (currentCommissionIdx >= 0 && summary.next_tier) {
    const next = summary.next_tier;
    const pct = Math.round(Number(next.commissionRate) * 100);
    return `Next tier: ${pct}% commission at ${fmtTierIncomeThreshold(next.minHostIncome)} beans turnover (30 days).`;
  }
  if (currentCommissionIdx >= 0) {
    return "Grow your 30-day agency turnover to unlock the next commission tier.";
  }
  return "Your agency is not matched to the commission ladder for this period.";
}

export function AgencyCenterScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const user = useSelector((s: RootState) => s.auth.user);
  const lastCommissionAt = useSelector(
    (s: RootState) => s.auth.lastCommissionAt,
  );
  const [commissionJourneyOpen, setCommissionJourneyOpen] = useState(false);
  const lastAgencyGiftStatsAt = useSelector(
    (s: RootState) => s.auth.lastAgencyGiftStatsAt,
  );

  const [activeTab, setActiveTab] = useState<TopTab>("Make Money");
  const [inviteVisible, setInviteVisible] = useState(false);
  const handleInvite = useCallback(() => setInviteVisible(true), []);

  const centerQuery = useAgencyCenterQuery();
  useRefetchOnFocusIfStale(
    () => centerQuery.refetch(),
    centerQuery.isStale,
    !centerQuery.isLoading,
  );

  useEffect(() => {
    if (lastCommissionAt == null && lastAgencyGiftStatsAt == null) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.agency.center() });
  }, [lastCommissionAt, lastAgencyGiftStatsAt]);

  const summary = centerQuery.data?.summary ?? null;
  const summaryV2 = centerQuery.data?.summaryV2 ?? null;
  const hosts = centerQuery.data?.hosts ?? [];
  const loading = centerQuery.isLoading && !centerQuery.data;
  const error = centerQuery.isError;

  if (loading) {
    return (
      <LinearGradient
        colors={["rgba(105, 96, 249, 0.95)", "rgba(255, 255, 255, 0.95)"]}
        locations={[0, 0.1154]}
        style={[styles.screen, { paddingTop: insets.top }]}
      >
        <Header navigation={navigation} />
        <DetailSkeleton />
      </LinearGradient>
    );
  }

  if (error) {
    return (
      <LinearGradient
        colors={["rgba(105, 96, 249, 0.95)", "rgba(255, 255, 255, 0.95)"]}
        locations={[0, 0.1154]}
        style={[styles.screen, { paddingTop: insets.top }]}
      >
        <Header navigation={navigation} />
        <View style={styles.center}>
          <Ionicons
            name="alert-circle-outline"
            size={40}
            color={Colors.danger}
          />
          <Text style={styles.errorText}>Failed to load agency data</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={["rgba(105, 96, 249, 0.95)", "rgba(255, 255, 255, 0.95)"]}
      locations={[0, 0.1154]}
      style={[styles.screen, { paddingTop: insets.top }]}
    >
      <Header navigation={navigation} />

      {/* Agent profile card */}
      <View style={styles.profileCard}>
        {/* Left: name + tier letter + coin seller badge */}
        <View style={styles.profileLeft}>
          <Text style={styles.profileName} numberOfLines={1}>
            {user?.displayName ?? "Agent"}
          </Text>
          <View style={styles.profileBadgeRow}>
            {summary && (
              <View style={styles.tierLetterBadge}>
                <Text style={styles.tierLetterText}>{summary.tier_name}</Text>
              </View>
            )}
            <Image
              source={require("../../../assets/agency/coin_seller_badge.png")}
              style={styles.coinSellerBadgeImg}
              contentFit="contain"
            />
          </View>
        </View>

        {/* Right: circular tier rate ring */}
        {summary && (
          <TierRingWidget
            currentRate={summary.effective_commission_rate}
            nextTier={summary.next_tier}
            rollingThirtyDayTurnover={
              summaryV2?.rollingThirtyDayAgencyHostIncome ?? "0"
            }
            maxRate={Math.max(
              ...summary.all_tiers.map((t) => t.commissionRate),
              summary.effective_commission_rate,
            )}
            topTier={
              summary.all_tiers.length > 0
                ? summary.all_tiers[summary.all_tiers.length - 1]
                : null
            }
            onRingPress={() => setCommissionJourneyOpen(true)}
          />
        )}
      </View>

      {/* Top tabs */}
      <View style={styles.tabBar}>
        {TOP_TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={styles.tab}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.tabTextActive,
              ]}
            >
              {tab}
            </Text>
            {activeTab === tab && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Status banner — shown when agency is suspended or banned */}
      {summaryV2 && summaryV2.agencyStatus !== "active" && (
        <View
          style={[
            styles.statusBanner,
            summaryV2.agencyStatus === "banned"
              ? styles.statusBannerBanned
              : styles.statusBannerSuspended,
          ]}
        >
          <Ionicons
            name={summaryV2.agencyStatus === "banned" ? "ban" : "pause-circle"}
            size={18}
            color="#fff"
          />
          <Text style={styles.statusBannerText}>
            {summaryV2.agencyStatus === "banned"
              ? "Your agency has been banned. Commission earnings are permanently disabled."
              : "Your agency is suspended. Commission earnings are paused until reinstated."}
          </Text>
        </View>
      )}

      {/* Tab content */}
      {activeTab === "Make Money" && summary && (
        <MakeMoneyTab
          summary={summary}
          summaryV2={summaryV2}
          navigation={navigation}
          onInvite={handleInvite}
        />
      )}
      {activeTab === "Manage" && summary && summaryV2 && (
        <ManageTab
          summaryV2={summaryV2}
          navigation={navigation}
          onInvite={handleInvite}
        />
      )}
      {activeTab === "Data" && summary && (
        <DataTab
          summary={summary}
          summaryV2={summaryV2}
          hosts={hosts}
          navigation={navigation}
        />
      )}

      {summary && (
        <CommissionTierJourneyModal
          visible={commissionJourneyOpen}
          onClose={() => setCommissionJourneyOpen(false)}
          summary={summary}
          rollingThirtyDayCommissionTurnoverDisplay={
            summaryV2?.rollingThirtyDayAgencyHostIncome
              ? fmtBigInt(summaryV2.rollingThirtyDayAgencyHostIncome)
              : "0"
          }
        />
      )}

      <InviteHostSheet
        visible={inviteVisible}
        onClose={() => setInviteVisible(false)}
      />
    </LinearGradient>
  );
}

// ── Header ──────────────────────────────────────────────────────────────────

function Header({ navigation }: { navigation: Props["navigation"] }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
        <Ionicons name="chevron-back" size={24} color="#000" />
      </TouchableOpacity>
      <View style={{ flex: 1 }} />
      <TouchableOpacity
        onPress={() => navigation.navigate("AgencyCommissionGuide")}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="How agency commission works"
      >
        <Ionicons name="help-circle-outline" size={24} color="#000" />
      </TouchableOpacity>
      <TouchableOpacity hitSlop={8}>
        <Image
          source={require("../../../assets/agency/agent.png")}
          style={styles.agentBadgeImg}
          contentFit="contain"
        />
      </TouchableOpacity>
      <TouchableOpacity hitSlop={8}>
        <Ionicons name="notifications-outline" size={22} color="#000" />
      </TouchableOpacity>
    </View>
  );
}

// ── Commission tier journey (same layout as gift-bonus ladder; agency rates A–E) ─

function CommissionTierJourneyModal({
  visible,
  onClose,
  summary,
  rollingThirtyDayCommissionTurnoverDisplay,
}: {
  visible: boolean;
  onClose: () => void;
  summary: AgencySummary;
  /** Rolling 30-day agency turnover (hostBeans sum) — same basis as commission tier. */
  rollingThirtyDayCommissionTurnoverDisplay: string;
}) {
  const insets = useSafeAreaInsets();
  const commissionTiers = summary.all_tiers;
  const activeTierName = summary.current_tier.name;
  const currentCommissionIdx = commissionTiers.findIndex(
    (t) => t.name === activeTierName,
  );
  const tierProgress =
    commissionTiers.length > 1 && currentCommissionIdx >= 0
      ? (currentCommissionIdx / (commissionTiers.length - 1)) * 100
      : 0;
  const commissionFillPct = tierFillDisplayPercent(
    tierProgress,
    currentCommissionIdx,
  );
  const commissionFooterNote = commissionLadderFooterNote(
    summary,
    commissionTiers,
    currentCommissionIdx,
  );
  const { width: windowWidth } = useWindowDimensions();
  const narrowModal = windowWidth < 380;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.commissionJourneyOverlayRoot,
          { paddingBottom: insets.bottom },
        ]}
      >
        <Pressable
          style={styles.commissionJourneyBackdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <View
          style={[
            styles.commissionJourneyCenter,
            narrowModal && styles.commissionJourneyCenterNarrow,
          ]}
          pointerEvents="box-none"
        >
          <View
            style={[
              styles.commissionJourneyCard,
              narrowModal && styles.commissionJourneyCardNarrow,
            ]}
          >
            <Text style={styles.commissionJourneyTitle}>Agency commission</Text>
            <Text style={styles.commissionJourneySubtitle}>
              Tier rates by rolling 30-day agency turnover
            </Text>

            <View style={[styles.tierCard, styles.commissionJourneyTierCard]}>
              <TierLadderSection
                tiers={commissionTiers}
                activeTierName={activeTierName}
                fillPercent={commissionFillPct}
                currentIdx={currentCommissionIdx}
                pctLabel={(t) =>
                  `${Math.round(Number(t.commissionRate) * 100)}%`
                }
                thresholdLabel={(t) =>
                  fmtTierIncomeThreshold(t.minHostIncome)
                }
              />

              <View style={styles.tierNoteWrapper}>
                <View style={styles.tierNoteRow}>
                  <Text style={styles.tierNote}>
                    Gift income in the past 30 days:{" "}
                  </Text>
                  <Image
                    source={require("../../../assets/coin.png")}
                    style={styles.tierNoteCoin}
                    contentFit="contain"
                  />
                  <Text
                    style={styles.tierNoteHighlight}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {rollingThirtyDayCommissionTurnoverDisplay}
                  </Text>
                </View>
                <Text style={styles.tierNote}>{commissionFooterNote}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.commissionJourneyCloseBtn}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={styles.commissionJourneyCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Tier Ring Widget ─────────────────────────────────────────────────────────

function TierRingLiquidCard({
  backgroundSource,
  children,
  compact = false,
}: {
  backgroundSource: number;
  children: React.ReactNode;
  /** Slightly smaller card (max tier) — scaled from the right edge */
  compact?: boolean;
}) {
  return (
    <View
      style={[
        styles.liquidShadowWrap,
        compact && styles.liquidShadowWrapMax,
      ]}
    >
      <View style={[styles.liquidCard, compact && styles.liquidCardMax]}>
        <Image
          source={backgroundSource}
          style={styles.liquidCardBg}
          contentFit="fill"
        />
        <View style={styles.tierRingGlassContent}>{children}</View>
      </View>
    </View>
  );
}

function TierRingInfoColumn({
  nextTierLabel,
  beansDisplay,
  measureOnly = false,
}: {
  nextTierLabel: string;
  beansDisplay: string | null;
  /** Invisible column that sizes the max-tier card to match the glass card */
  measureOnly?: boolean;
}) {
  return (
    <View
      style={[styles.tierRingInfo, measureOnly && styles.tierRingInfoSizer]}
      pointerEvents={measureOnly ? "none" : "auto"}
      {...(measureOnly
        ? {
            importantForAccessibility: "no-hide-descendants" as const,
            accessibilityElementsHidden: true,
          }
        : {})}
    >
      <View style={styles.tierRingNextPill}>
        <Image
          source={require("../../../assets/agency/tier_arrow_up.png")}
          style={styles.tierRingNextArrow}
          contentFit="contain"
        />
        <Text style={styles.tierRingNext} numberOfLines={1}>
          {nextTierLabel}
        </Text>
      </View>
      <View style={styles.tierRingRequiresRow}>
        <View style={styles.tierRingRequiresTextCol}>
          <Text style={styles.tierRingRequiresText}>Earning</Text>
          <Text style={styles.tierRingRequiresText}>requires</Text>
        </View>
        <Image
          source={require("../../../assets/coin.png")}
          style={styles.tierRingCoin}
          contentFit="contain"
        />
      </View>
      {beansDisplay ? (
        <TouchableOpacity activeOpacity={0.7} disabled={measureOnly}>
          <Text style={styles.tierRingValue} numberOfLines={1}>
            {beansDisplay}
            <Text style={styles.tierRingChevron}>{" »"}</Text>
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function TierRingWidget({
  currentRate,
  nextTier,
  rollingThirtyDayTurnover,
  maxRate,
  topTier,
  onRingPress,
}: {
  currentRate: number;
  nextTier: AgencyTierInfo | null;
  /** Rolling 30-day turnover used for commission tier thresholds */
  rollingThirtyDayTurnover: string;
  maxRate: number;
  /** Highest commission tier (for max-card width sizer and at-max detection) */
  topTier: AgencyTierInfo | null;
  /** Open commission tier journey overlay (donut only) */
  onRingPress?: () => void;
}) {
  const pct = Math.round(currentRate * 100);
  const nextRate = nextTier ? Math.round(nextTier.commissionRate * 100) : null;
  const atMaxTier =
    nextTier == null && maxRate > 0 && currentRate >= maxRate - 1e-6;

  // How many more beans needed to reach next tier
  let beansNeeded: string | null = null;
  if (nextTier) {
    try {
      const income = BigInt(rollingThirtyDayTurnover);
      const target = BigInt(nextTier.minHostIncome);
      const diff = target - income;
      beansNeeded = diff > 0n ? diff.toLocaleString() : null;
    } catch {
      /* ignore */
    }
  }

  // Arc progress tracks current commission rate relative to the max tier rate
  const progress =
    maxRate > 0 ? Math.max(0, Math.min(1, currentRate / maxRate)) : 0;

  const ringSize = 56;
  const strokeWidth = 2;
  const cx = ringSize / 2;
  const cy = ringSize / 2;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  /** Open arc (~270°) with gap centered at the bottom — not a full ring */
  const ARC_SWEEP = 270 / 360;
  const arcLength = circumference * ARC_SWEEP;
  const gapLength = circumference - arcLength;
  const progressLength = arcLength * progress;
  const arcRotate = `rotate(135 ${cx} ${cy})`;

  const ringDonut = (
    <View style={[styles.tierRingOuter, { width: ringSize, height: ringSize, backgroundColor: "transparent" }]}>
      <Svg width={ringSize} height={ringSize} style={{ backgroundColor: "transparent" }}>
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke={Colors.borderLight}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${arcLength} ${gapLength}`}
          strokeLinecap="round"
          transform={arcRotate}
        />
        {progressLength > 0 ? (
          <Circle
            cx={cx}
            cy={cy}
            r={radius}
            stroke={Colors.primary}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${progressLength} ${circumference}`}
            strokeLinecap="round"
            transform={arcRotate}
          />
        ) : null}
      </Svg>
      <View style={styles.tierRingInnerAbs}>
        <Text style={styles.tierRingPctSingle}>
          <Text style={styles.tierRingPctNum}>{pct}</Text>
          <Text style={styles.tierRingPctSymbol}>%</Text>
        </Text>
      </View>
    </View>
  );

  const ringControl = onRingPress ? (
    <Pressable
      onPress={onRingPress}
      accessibilityRole="button"
      accessibilityLabel="View agency commission tier ladder"
      hitSlop={6}
      style={({ pressed }) => [pressed && styles.tierRingDonutPressed]}
    >
      {ringDonut}
    </Pressable>
  ) : (
    ringDonut
  );

  const topTierLabel = topTier
    ? `${topTier.name}: ${Math.round(Number(topTier.commissionRate) * 100)}%`
    : `E: ${Math.round(maxRate * 100)}%`;
  const maxCardSizerBeans = topTier
    ? fmtBigInt(topTier.minHostIncome)
    : "9,999,999";

  return (
    <View style={styles.tierRingContainer}>
      {atMaxTier ? (
        <TierRingLiquidCard
          compact
          backgroundSource={require("../../../assets/agency/tier_max_card.png")}
        >
          {ringControl}
          <TierRingInfoColumn
            nextTierLabel={topTierLabel}
            beansDisplay={maxCardSizerBeans}
            measureOnly
          />
        </TierRingLiquidCard>
      ) : nextRate !== null ? (
        <TierRingLiquidCard
          backgroundSource={require("../../../assets/agency/tier_glass_card.png")}
        >
          {ringControl}
          <TierRingInfoColumn
            nextTierLabel={`${nextTier!.name}: ${nextRate}%`}
            beansDisplay={beansNeeded}
          />
        </TierRingLiquidCard>
      ) : (
        ringControl
      )}
    </View>
  );
}

function openPromotionLink(url: string) {
  const trimmed = url.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return;
  Linking.openURL(trimmed).catch(() =>
    Alert.alert("Error", "Could not open link"),
  );
}

// ── Make Money Tab ──────────────────────────────────────────────────────────

const MakeMoneyTab = React.memo(function MakeMoneyTab({
  summary,
  summaryV2,
  navigation,
  onInvite,
}: {
  summary: AgencySummary;
  summaryV2: AgencySummaryV2 | null;
  navigation: Props["navigation"];
  onInvite: () => void;
}) {
  const authUser = useSelector((s: RootState) => s.auth.user);
  const walletBeanBalance = useSelector((s: RootState) => s.wallet.beanBalance);
  const giftBonusProgramEnabled =
    summaryV2?.giftBonusProgramEnabled ?? false;

  /** Rolling 7-day gift bonus ladder (not agency commission — see profile ring + tier badge). */
  const giftBonusTiersRaw = summaryV2?.allGiftBonusTiers ?? [];
  const giftBonusTiers =
    giftBonusTiersRaw.length < 2
      ? DEFAULT_GIFT_BONUS_DISPLAY_TIERS
      : giftBonusTiersRaw;
  const activeGiftTierName = summaryV2?.currentGiftBonusTier?.name ?? "";
  const currentGiftBonusIdx = giftBonusTiers.findIndex(
    (t) => t.name === activeGiftTierName,
  );
  const rollingGiftIncome = summaryV2?.rollingSevenDayAgencyHostIncome;
  const incomeBasedFill = giftBonusIncomeTrackFillPercent(
    rollingGiftIncome,
    giftBonusTiers,
  );
  const giftBonusFillPct = rollingAgencyHostIncomeIsZero(rollingGiftIncome)
    ? 0
    : tierFillDisplayPercent(incomeBasedFill, currentGiftBonusIdx);
  const giftBonusFooterNote = giftBonusLadderFooterNote(
    summaryV2,
    giftBonusTiers,
    currentGiftBonusIdx,
    giftBonusTiersRaw.length,
  );
  const rollingSevenDayDisplay = summaryV2?.rollingSevenDayAgencyHostIncome
    ? fmtBigInt(summaryV2.rollingSevenDayAgencyHostIncome)
    : "0";

  const [learnPromotions, setLearnPromotions] = useState<AgencyLearnPromotion[]>(
    [],
  );
  const [learnPromosLoading, setLearnPromosLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLearnPromosLoading(true);
    agencyApi
      .getLearnPromotions()
      .then((rows) => {
        if (!cancelled) setLearnPromotions(rows);
      })
      .catch(() => {
        if (!cancelled) setLearnPromotions([]);
      })
      .finally(() => {
        if (!cancelled) setLearnPromosLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.tabContent}
    >
      {/* Earnings summary card */}
      <View style={styles.earningsCard}>
        <View style={styles.earningsRow}>
          <View style={styles.earningsCol}>
            <View style={styles.earningsLabelRow}>
              <Text style={styles.earningsLabel}>Earned Today</Text>
              <Image
                source={require("../../../assets/coin.png")}
                style={styles.earningsCoin}
                contentFit="contain"
              />
              <Ionicons name="help-circle-outline" size={16} color="#0B0B14" />
            </View>
            <Text style={styles.earningsValue}>
              {summary.total_beans_earned_today.toLocaleString()}
            </Text>
          </View>

          <View style={styles.earningsDivider} />

          <View style={styles.earningsCol}>
            <View style={styles.earningsLabelRow}>
              <Text style={styles.earningsLabel}>Points</Text>
              <Image
                source={require("../../../assets/bean.png")}
                style={styles.earningsCoin}
                contentFit="contain"
              />
              <TouchableOpacity
                style={styles.withdrawPill}
                onPress={() => navigation.navigate("Withdraw")}
                activeOpacity={0.85}
              >
                <Text style={styles.withdrawPillText}>Withdraw</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.earningsValue}>
              {walletBeanBalance.toLocaleString()}
            </Text>
            <Text style={styles.pointsWalletCaption}>
              Wallet beans (same as Withdraw)
            </Text>
          </View>
        </View>

        <View style={styles.accumulatedBar}>
          <Text style={styles.accumulatedBarText}>
            Agency turnover (last 30 days):{" "}
            <Text style={styles.accumulatedBarValue}>
              {summaryV2?.rollingThirtyDayAgencyHostIncome != null &&
              summaryV2.rollingThirtyDayAgencyHostIncome !== ""
                ? fmtBigInt(summaryV2.rollingThirtyDayAgencyHostIncome)
                : fmtBigInt(summary.cumulative_host_income)}
            </Text>
          </Text>
        </View>
      </View>

      {/* Gift bonus tier journey — only when gift-bonus program is active */}
      {giftBonusProgramEnabled ? (
      <View style={styles.tierCard}>
        <TierLadderSection
          tiers={giftBonusTiers}
          activeTierName={activeGiftTierName}
          fillPercent={giftBonusFillPct}
          currentIdx={currentGiftBonusIdx}
          pctLabel={(t) =>
            `${Math.round(Number(t.bonusRate ?? 0) * 100)}%`
          }
          thresholdLabel={(t) =>
            fmtTierIncomeThreshold(t.minRollingIncome)
          }
        />

        <View style={styles.tierNoteWrapper}>
          <View style={styles.tierNoteRow}>
            <Text style={styles.tierNote}>
              Gift income in the past 7 days:{" "}
            </Text>
            <Image
              source={require("../../../assets/coin.png")}
              style={styles.tierNoteCoin}
              contentFit="contain"
            />
            <Text style={styles.tierNoteHighlight}>
              {rollingSevenDayDisplay}
            </Text>
          </View>
          <Text style={styles.tierNote}>{giftBonusFooterNote}</Text>
        </View>
      </View>
      ) : null}

      {!giftBonusProgramEnabled ? (
      <LinearGradient
        colors={["#5B2FD4", "#7B4FFF"]}
        style={styles.leaderboardBanner}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.bannerTitle}>
            Monthly Agent Invitation Leaderboard
          </Text>
          <Text style={styles.bannerDate}>
            {`1 ${new Date().toLocaleDateString("en-US", { month: "long" })} – ${new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()} ${new Date().toLocaleDateString("en-US", { month: "long" })}`}
          </Text>
        </View>
      </LinearGradient>
      ) : null}

      {/* Money-Making Tools */}
      <Text style={styles.sectionTitle}>Money - Making Tools</Text>
      <View style={styles.toolsCard}>
        <View style={styles.toolsGrid}>
          <ToolButton
            source={require("../../../assets/agency/add_host.png")}
            label="Add Host"
            tint="rgba(255, 56, 60, 0.1)"
            onPress={onInvite}
          />
          <ToolButton
            source={require("../../../assets/agency/invite_agent.png")}
            label="Invite Agent"
            tint="rgba(0, 136, 255, 0.1)"
            onPress={() => navigation.navigate("AgencyInvitations")}
          />
          <ToolButton
            source={require("../../../assets/agency/coin_trading.png")}
            label="Coin Trading"
            tint="rgba(255, 56, 60, 0.1)"
            onPress={() =>
              navigation.navigate("CoinSeller", { initialSellerSub: "Trading" })
            }
          />
          <ToolButton
            source={require("../../../assets/agency/agent_trophy.png")}
            label="Ranking"
            onPress={() =>
              navigation.navigate("Ranking", { initialTab: "agent" })
            }
          />
          {canAccessLevelTask(authUser) ? (
            <ToolButton
              source={require("../../../assets/agency/agent_reward.png")}
              label="Level Task"
              onPress={() => navigation.navigate("FemaleHostTask")}
            />
          ) : null}
        </View>
      </View>

      {(learnPromosLoading || learnPromotions.length > 0) && (
        <>
          <Text style={styles.sectionTitle}>Earn Money - Learn Promotion</Text>
          {learnPromosLoading ? (
            <View style={styles.promoList}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={styles.promoRow}>
                  <View style={[styles.promoIcon, styles.promoPlaceholder]} />
                  <View style={styles.promoInfo}>
                    <View style={[styles.promoPlaceholderBar, { width: "70%" }]} />
                    <View
                      style={[styles.promoPlaceholderBar, { width: "90%", height: 11 }]}
                    />
                    <View
                      style={[styles.promoPlaceholderBar, { width: 100, height: 10 }]}
                    />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.promoList}>
              {learnPromotions.map((p) => (
                <PromoItem key={p.id} promotion={p} />
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
});

// ── Manage Tab ──────────────────────────────────────────────────────────────

const ManageTab = React.memo(function ManageTab({
  summaryV2,
  navigation,
  onInvite,
}: {
  summaryV2: AgencySummaryV2;
  navigation: Props["navigation"];
  onInvite: () => void;
}) {
  const rewardIcon = require("../../../assets/agency/reward.png");
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.tabContent}
    >
      {/* Host Incentive Tools — gold border card */}
      <View style={styles.incentiveCardGold}>
        <Text style={styles.incentiveCardTitle}>Host incentive tools</Text>
        <View style={styles.incentiveItemsRow}>
          <View style={styles.incentiveItem}>
            <View style={styles.incentiveFundsSlot}>
              <Text style={styles.incentiveFundsValue}>19.000</Text>
            </View>
            <Text style={styles.incentiveLabel}>
              Super Funds{"\n"}Management
            </Text>
          </View>
          <IncentiveSquareBtn
            label="Super Salary"
            bg="#E3F4FD"
            imageSource={require("../../../assets/agency/super_salary.png")}
          />
          <IncentiveSquareBtn
            label="Super Rank"
            bg="#FDE8EF"
            imageSource={require("../../../assets/agency/super_rank.png")}
          />
          <IncentiveSquareBtn
            label="Super Party"
            bg="#EDE8FF"
            imageSource={require("../../../assets/agency/super_party.png")}
          />
        </View>
      </View>

      {/* Host Management — neutral border */}
      <View style={styles.incentiveCardNeutral}>
        <Text style={styles.incentiveCardTitle}>Host Management</Text>
        <View style={styles.incentiveItemsRow}>
          <TouchableOpacity
            style={styles.incentiveItem}
            onPress={() => navigation.navigate("HostManagement")}
          >
            <View style={styles.incentiveFundsSlot}>
              <Text style={styles.incentiveFundsValue}>
                {summaryV2.totalHosts.toLocaleString()}
              </Text>
            </View>
            <Text style={styles.incentiveLabel}>My Host</Text>
          </TouchableOpacity>
          <IncentiveSquareBtn
            label={`Base Salary\nHost`}
            bg="#E3F4FD"
            slotValue={summaryV2.baseSalaryHostCount}
            onPress={() => {}}
          />
          <IncentiveSquareBtn
            label={`Host\nApplication`}
            bg="#FDE8EF"
            imageSource={require("../../../assets/agency/host_app.png")}
            onPress={() => {}}
          />
          <IncentiveSquareBtn
            label="Add Host"
            bg="#EDE8FF"
            imageSource={require("../../../assets/agency/add_host.png")}
            onPress={onInvite}
          />
        </View>
        <View style={styles.monthlyStatsRow}>
          <Text style={styles.monthlyStatItem}>
            Beans this month:{" "}
            <Text style={styles.monthlyStatValue}>{summaryV2.monthHostBeans.toLocaleString()}</Text>
          </Text>
          <Text style={styles.monthlyStatItem}>
            Commission:{" "}
            <Text style={styles.monthlyStatValue}>{summaryV2.monthHostCommission.toLocaleString()}</Text>
          </Text>
        </View>
      </View>

      {/* Invite Agent — white card with shadow, same grid pattern */}
      <View style={styles.inviteAgentCard}>
        <Text style={styles.incentiveCardTitle}>Invite Agent</Text>
        <View style={styles.incentiveItemsRow}>
          <View style={styles.incentiveItem}>
            <View style={styles.incentiveFundsSlot}>
              <Text style={styles.incentiveFundsValue}>
                {summaryV2.subAgencyCount.toLocaleString()}
              </Text>
            </View>
            <Text style={styles.incentiveLabel}>My Agency</Text>
          </View>
          <TouchableOpacity
            style={styles.incentiveItem}
            onPress={() => navigation.navigate("AgencyInvitations")}
          >
            <View
              style={[styles.incentiveSquare, { backgroundColor: "#EDE8FF" }]}
            >
              <Image
                source={require("../../../assets/agency/add_host.png")}
                style={styles.incentiveSquareImage}
                contentFit="contain"
              />
            </View>
            <Text style={styles.incentiveLabel}>Invitations</Text>
          </TouchableOpacity>
          <View style={styles.incentiveItem} />
          <View style={styles.incentiveItem} />
        </View>
        <View style={styles.monthlyStatsRow}>
          <Text style={styles.monthlyStatItem}>
            Commission this month:{" "}
            <Text style={styles.monthlyStatValue}>{summaryV2.monthSubAgentCommission.toLocaleString()}</Text>
          </Text>
        </View>
      </View>

      {/* Platform Reward — white card with shadow */}
      <View style={styles.inviteAgentCard}>
        <Text style={styles.incentiveCardTitle}>Platform Reward</Text>
        <View style={styles.toolsGridWrap}>
          <SquareToolBtn
            imageSource={rewardIcon}
            label="Ranking"
            bg="#EDE8FF"
            onPress={() => {}}
          />
          <SquareToolBtn
            imageSource={rewardIcon}
            label="Reward"
            bg="#EDE8FF"
            onPress={() => {}}
          />
          <SquareToolBtn
            imageSource={rewardIcon}
            label="Activity Centre"
            bg="#EDE8FF"
            onPress={() => {}}
          />
        </View>
      </View>

      {/* Money-making tools — white card with shadow */}
      <View style={styles.inviteAgentCard}>
        <Text style={styles.incentiveCardTitle}>Money-making tools</Text>
        <View style={styles.toolsGridWrap}>
          <SquareToolBtn
            imageSource={rewardIcon}
            label="Ranking"
            bg="#EDE8FF"
            onPress={() => {}}
          />
          <SquareToolBtn
            imageSource={rewardIcon}
            label="Reward"
            bg="#EDE8FF"
            onPress={() => {}}
          />
          <SquareToolBtn
            imageSource={rewardIcon}
            label="Activity Centre"
            bg="#EDE8FF"
            onPress={() => {}}
          />
        </View>
      </View>
    </ScrollView>
  );
});

// ── Data Tab ────────────────────────────────────────────────────────────────

const DATA_SUBTABS = ["Overview", "Host analysis", "Income analysis"] as const;
type DataSubTab = (typeof DATA_SUBTABS)[number];

function formatAxisValue(v: number): string {
  if (v >= 1_000_000) return `${Math.round(v / 1_000_000)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
  return v.toString();
}

function monthDay(isoDate: string): string {
  // "2026-04-21" → "04-21"
  return isoDate.length >= 10 ? isoDate.slice(5, 10) : isoDate;
}

function MiniLineChart({
  data,
  metric,
}: {
  data: AgencyDailyAnalytics | null;
  metric: "hostBeans" | "commission";
}) {
  const W = Dimensions.get("window").width - Spacing.lg * 4 - 40;
  const H = 120;
  const PAD_L = 44;
  const PAD_B = 28;
  const PAD_T = 12;
  const chartW = W - PAD_L;
  const chartH = H - PAD_B - PAD_T;

  const series = data?.daily ?? [];
  const values = series.map((d) => d[metric]);
  const hasData = values.length >= 2;
  const maxVal = hasData ? Math.max(...values, 1) : 1;

  // 4 Y ticks evenly spaced
  const Y_STEPS = Array.from({ length: 4 }, (_, i) => (maxVal * i) / 3);
  // Pick 5 X ticks spaced across the series
  const labelCount = Math.min(5, series.length);
  const xTickIdx =
    labelCount > 0
      ? Array.from({ length: labelCount }, (_, i) =>
          Math.round((i * (series.length - 1)) / Math.max(1, labelCount - 1)),
        )
      : [];

  const toX = (i: number) =>
    PAD_L + (hasData ? (i / (series.length - 1)) * chartW : 0);
  const toY = (v: number) => PAD_T + chartH - (v / maxVal) * chartH;

  const pointsStr = hasData
    ? values.map((val, i) => `${toX(i)},${toY(val)}`).join(" ")
    : "";

  return (
    <View style={{ marginTop: Spacing.lg }}>
      <Svg width={W} height={H}>
        {Y_STEPS.map((_v, i) => {
          const y = PAD_T + (i / (Y_STEPS.length - 1)) * chartH;
          return (
            <React.Fragment key={`y${i}`}>
              <Line
                x1={PAD_L}
                y1={y}
                x2={W}
                y2={y}
                stroke="#F0F0F0"
                strokeWidth={1}
              />
              <SvgText
                x={PAD_L - 4}
                y={y + 4}
                fontSize={9}
                fill="#BBB"
                textAnchor="end"
              >
                {formatAxisValue(Y_STEPS[Y_STEPS.length - 1 - i])}
              </SvgText>
            </React.Fragment>
          );
        })}
        {hasData && (
          <>
            <Polyline
              points={pointsStr}
              fill="none"
              stroke={Colors.primary}
              strokeWidth={2}
            />
            {values.map((v, i) => (
              <Circle
                key={i}
                cx={toX(i)}
                cy={toY(v)}
                r={3}
                fill={Colors.primary}
              />
            ))}
          </>
        )}
        {xTickIdx.map((idx) => (
          <SvgText
            key={`x${idx}`}
            x={toX(idx)}
            y={H - 6}
            fontSize={8}
            fill="#BBB"
            textAnchor="middle"
          >
            {monthDay(series[idx].date)}
          </SvgText>
        ))}
      </Svg>
      <Text style={styles.chartLegend}>
        {hasData ? "● current period" : "No data"}
      </Text>
    </View>
  );
}

const PERIOD_OPTIONS: Array<{ label: string; days: number }> = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

const DataTab = React.memo(function DataTab({
  summary,
  summaryV2,
  hosts,
  navigation,
}: {
  summary: AgencySummary;
  summaryV2: AgencySummaryV2 | null;
  hosts: AgencyHost[];
  navigation: Props["navigation"];
}) {
  const [subTab, setSubTab] = useState<DataSubTab>("Overview");
  const [periodIdx, setPeriodIdx] = useState(1); // default: Last 30 days
  const [daily, setDaily] = useState<AgencyDailyAnalytics | null>(null);
  const days = PERIOD_OPTIONS[periodIdx].days;

  React.useEffect(() => {
    let cancelled = false;
    agencyApi
      .getDailyAnalytics(days)
      .then((res) => {
        if (!cancelled) setDaily(res);
      })
      .catch(() => {
        if (!cancelled) setDaily({ days, daily: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const pickPeriod = () => {
    Alert.alert(
      "Select period",
      undefined,
      PERIOD_OPTIONS.map((opt, idx) => ({
        text: opt.label,
        onPress: () => setPeriodIdx(idx),
      })).concat([
        {
          text: "Cancel",
          onPress: () => {
            /* noop */
          },
        },
      ]),
    );
  };

  // Period totals from the daily series (single source of truth for "current period")
  const periodHostBeans =
    daily?.daily.reduce((s, d) => s + d.hostBeans, 0) ?? 0;
  const periodCommission =
    daily?.daily.reduce((s, d) => s + d.commission, 0) ?? 0;

  // All-time direct vs invite-agent split (only split we have; split per-period not tracked)
  const directAllTime = summaryV2?.directCommissionAllTime ?? 0;
  const inviteAllTime = summaryV2?.inviteAgentCommissionAllTime ?? 0;
  const totalAllTime = directAllTime + inviteAllTime;
  const directRatio = totalAllTime > 0 ? directAllTime / totalAllTime : 0;
  const inviteRatio = totalAllTime > 0 ? inviteAllTime / totalAllTime : 0;

  // Apply the all-time ratio to period commission to estimate host vs invite split for the period.
  const periodHostCommission = Math.round(periodCommission * directRatio);
  const periodInviteCommission = Math.round(periodCommission * inviteRatio);
  const periodHostEarnings = Math.round(periodHostBeans * directRatio);
  const periodInviteEarnings = Math.round(periodHostBeans * inviteRatio);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.tabContent}
    >
      {/* Underline-style sub-tabs */}
      <View style={styles.dataSubTabs}>
        {DATA_SUBTABS.map((st) => (
          <TouchableOpacity
            key={st}
            style={styles.dataSubTab}
            onPress={() => setSubTab(st)}
          >
            <Text
              style={[
                styles.dataSubTabText,
                subTab === st && styles.dataSubTabTextActive,
              ]}
            >
              {st}
            </Text>
            {subTab === st && <View style={styles.dataSubTabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      {subTab === "Overview" && (
        <View style={styles.dataSection}>
          {/* Header row: title + period selector */}
          <View style={styles.dataHeaderRow}>
            <View style={styles.dataTitleRow}>
              <Text style={styles.dataTitle}>Earning & Commission</Text>
              <Ionicons name="help-circle-outline" size={14} color="#999" />
            </View>
            <TouchableOpacity style={styles.periodPicker} onPress={pickPeriod}>
              <Text style={styles.periodPickerText}>
                {PERIOD_OPTIONS[periodIdx].label} ▼
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.dataSubtitle}>Refresh data every 30 minutes</Text>

          {/* 3×2 metrics grid */}
          <View style={styles.metricsCard}>
            <View style={styles.metricsRow}>
              <MetricCell
                label={`Total\nEarnings`}
                value={periodHostBeans.toLocaleString()}
              />
              <View style={styles.metricsDividerV} />
              <MetricCell
                label={`Host\nEarnings`}
                value={periodHostEarnings.toLocaleString()}
              />
              <View style={styles.metricsDividerV} />
              <MetricCell
                label={`Invite agent\nearnings`}
                value={periodInviteEarnings.toLocaleString()}
              />
            </View>
            <View style={styles.metricsDividerH} />
            <View style={styles.metricsRow}>
              <MetricCell
                label={`Total\ncommission`}
                value={periodCommission.toLocaleString()}
              />
              <View style={styles.metricsDividerV} />
              <MetricCell
                label={`Host\ncommission`}
                value={periodHostCommission.toLocaleString()}
              />
              <View style={styles.metricsDividerV} />
              <MetricCell
                label={`Invite agent\ncommission`}
                value={periodInviteCommission.toLocaleString()}
              />
            </View>
          </View>

          {/* Line chart — white card with shadow */}
          <View style={styles.chartCard}>
            <MiniLineChart data={daily} metric="hostBeans" />
          </View>
        </View>
      )}

      {subTab === "Host analysis" && (
        <HostAnalysisSubTab
          summary={summary}
          summaryV2={summaryV2}
          navigation={navigation}
        />
      )}

      {subTab === "Income analysis" && (
        <IncomeAnalysisSubTab
          summary={summary}
          summaryV2={summaryV2}
          daily={daily}
          periodLabel={PERIOD_OPTIONS[periodIdx].label}
          onPickPeriod={pickPeriod}
        />
      )}
    </ScrollView>
  );
});

// ── Host Analysis Sub-tab ───────────────────────────────────────────────────

const HOURLY_GRADES = ["S", "A", "B", "C", "D", "E", "F"];
// Stub donut data — 3 segments
const DONUT_SEGMENTS = [
  { pct: 0.45, color: "#7B4FFF" },
  { pct: 0.3, color: "#22D4C8" },
  { pct: 0.25, color: "#FF8A9B" },
];
const DONUT_TOTAL = 4;

function DonutChart({ size = 180 }: { size?: number }) {
  const R = (size - 24) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const strokeW = 28;

  let startAngle = -Math.PI / 2;
  const arcs: { d: string; color: string }[] = [];
  for (const seg of DONUT_SEGMENTS) {
    const sweep = seg.pct * 2 * Math.PI;
    const x1 = cx + R * Math.cos(startAngle);
    const y1 = cy + R * Math.sin(startAngle);
    const endAngle = startAngle + sweep - 0.02; // small gap between segments
    const x2 = cx + R * Math.cos(endAngle);
    const y2 = cy + R * Math.sin(endAngle);
    const largeArc = sweep > Math.PI ? 1 : 0;
    arcs.push({
      d: `M ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2}`,
      color: seg.color,
    });
    startAngle += seg.pct * 2 * Math.PI;
  }

  return (
    <View style={{ alignItems: "center", marginVertical: Spacing.lg }}>
      <Svg width={size} height={size}>
        {arcs.map((arc, i) => (
          <Path
            key={i}
            d={arc.d}
            stroke={arc.color}
            strokeWidth={strokeW}
            strokeLinecap="butt"
            fill="none"
          />
        ))}
        <SvgText
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          fontSize={28}
          fontWeight="bold"
          fill="#000"
        >
          {DONUT_TOTAL}
        </SvgText>
        <SvgText
          x={cx}
          y={cy + 18}
          textAnchor="middle"
          fontSize={13}
          fill="#666"
        >
          Number
        </SvgText>
      </Svg>
    </View>
  );
}

function HostAnalysisSubTab({
  summary,
  summaryV2,
  navigation,
}: {
  summary: AgencySummary;
  summaryV2: AgencySummaryV2 | null;
  navigation: Props["navigation"];
}) {
  const today = summaryV2?.todayBeans ?? summary.total_beans_earned_today ?? 0;
  const yesterday = summaryV2?.yesterdayBeans ?? 0;
  const sameDayLastWeek = summaryV2?.sameDayLastWeekBeans ?? 0;

  return (
    <View style={styles.dataSection}>
      {/* Total number of host */}
      <View style={styles.hostOverviewCard}>
        <View style={styles.hostOverviewIconWrap}>
          <Ionicons name="person-add" size={22} color="#FFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.hostOverviewLabel}>Total number of host</Text>
          <Text style={styles.hostOverviewValue}>{summary.total_hosts}</Text>
        </View>
        <TouchableOpacity
          style={styles.manageOutlinePill}
          onPress={() => navigation.navigate("HostManagement")}
        >
          <Text style={styles.manageOutlinePillText}>Manage</Text>
        </TouchableOpacity>
      </View>

      {/* Hourly grade distribution + Day stats — white card with shadow */}
      <View style={styles.hostAnalysisCard}>
        <Text style={styles.gradeSectionTitle}>Hourly grade distribution</Text>
        <Text style={styles.gradeSubtitle}>
          Refresh data every 30 minutes, minutes, with statistics based on
          number of people receiving hourly tasks.
        </Text>
        <Text style={[styles.gradeSectionTitle, { marginTop: Spacing.md }]}>
          Hourly grade
        </Text>
        <View style={styles.gradePillsRow}>
          {HOURLY_GRADES.map((g) => (
            <View key={g} style={styles.gradePill}>
              <Text style={styles.gradePillText}>{g}</Text>
            </View>
          ))}
        </View>

        {/* Donut chart */}
        <DonutChart />

        {/* Today / Yesterday / Same day last week */}
        <View style={styles.dayStatsRow}>
          {[
            { label: "Today", value: today.toLocaleString() },
            { label: "Yesterday", value: yesterday.toLocaleString() },
            {
              label: "Same day\nlast week",
              value: sameDayLastWeek.toLocaleString(),
            },
          ].map((item) => (
            <View key={item.label} style={styles.dayStatCard}>
              <Text style={styles.dayStatLabel}>{item.label}</Text>
              <Text style={styles.dayStatValue}>{item.value}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ── Income Analysis Sub-tab ─────────────────────────────────────────────────

function IncomeAnalysisSubTab({
  summary,
  summaryV2,
  daily,
  periodLabel,
  onPickPeriod,
}: {
  summary: AgencySummary;
  summaryV2: AgencySummaryV2 | null;
  daily: AgencyDailyAnalytics | null;
  periodLabel: string;
  onPickPeriod: () => void;
}) {
  const W = Dimensions.get("window").width - Spacing.lg * 2 - 40;
  const H = 160;
  const PAD_L = 44;
  const PAD_B = 28;
  const PAD_T = 12;
  const chartW = W - PAD_L;
  const chartH = H - PAD_B - PAD_T;

  const series = daily?.daily ?? [];
  const commissionValues = series.map((d) => d.commission);
  const hasData = commissionValues.length >= 2;
  const maxVal = hasData ? Math.max(...commissionValues, 1) : 1;
  const Y_STEPS = Array.from({ length: 6 }, (_, i) => (maxVal * i) / 5);

  const toX = (i: number) =>
    PAD_L + (hasData ? (i / (series.length - 1)) * chartW : 0);
  const toY = (v: number) => PAD_T + chartH - (v / maxVal) * chartH;
  const pointsStr = hasData
    ? commissionValues.map((v, i) => `${toX(i)},${toY(v)}`).join(" ")
    : "";

  // Pick up to 7 evenly-spaced X labels
  const labelCount = Math.min(7, series.length);
  const xTickIdx =
    labelCount > 0
      ? Array.from({ length: labelCount }, (_, i) =>
          Math.round((i * (series.length - 1)) / Math.max(1, labelCount - 1)),
        )
      : [];

  const periodCommission = series.reduce((s, d) => s + d.commission, 0);
  const allTimeVal = (
    summaryV2?.allTimeCommission ?? summary.total_commission_all_time
  ).toLocaleString();
  const periodCommissionVal = periodCommission.toLocaleString();

  // All-time composition split
  const direct = summaryV2?.directCommissionAllTime ?? 0;
  const invite = summaryV2?.inviteAgentCommissionAllTime ?? 0;
  const total = direct + invite;
  const directPct = total > 0 ? Math.round((direct / total) * 100) : 0;
  const invitePct = total > 0 ? 100 - directPct : 0;

  return (
    <View style={styles.dataSection}>
      <View style={styles.dataHeaderRow}>
        <View style={styles.dataTitleRow}>
          <Text style={styles.dataTitle}>Income Overview</Text>
          <Ionicons name="help-circle-outline" size={14} color="#999" />
        </View>
        <TouchableOpacity style={styles.periodPicker} onPress={onPickPeriod}>
          <Text style={styles.periodPickerText}>{periodLabel} ▼</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.dataSubtitle}>Refresh data every 30 minutes</Text>

      {/* Income / Historical income cards */}
      <View style={styles.incomeCardsRow}>
        <View style={[styles.incomeCard, { backgroundColor: "#F0F0F0" }]}>
          <Text style={styles.incomeCardLabel}>Income</Text>
          <Text style={styles.incomeCardValue}>{periodCommissionVal}</Text>
        </View>
        <View
          style={[
            styles.incomeCard,
            { borderWidth: 1, borderColor: "#E0E0E0" },
          ]}
        >
          <Text style={styles.incomeCardLabel}>Historical{"\n"}Income</Text>
          <Text style={styles.incomeCardValue}>{allTimeVal}</Text>
        </View>
      </View>

      {/* Line chart */}
      <View style={{ marginTop: Spacing.md }}>
        <Svg width={W} height={H}>
          {Y_STEPS.map((_v, i) => {
            const y = PAD_T + (i / (Y_STEPS.length - 1)) * chartH;
            return (
              <React.Fragment key={`y${i}`}>
                <Line
                  x1={PAD_L}
                  y1={y}
                  x2={W}
                  y2={y}
                  stroke="#E0E0E0"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <SvgText
                  x={PAD_L - 4}
                  y={y + 4}
                  fontSize={9}
                  fill="#AAA"
                  textAnchor="end"
                >
                  {formatAxisValue(Y_STEPS[Y_STEPS.length - 1 - i])}
                </SvgText>
              </React.Fragment>
            );
          })}
          {hasData && (
            <>
              <Polyline
                points={pointsStr}
                fill="none"
                stroke={Colors.primary}
                strokeWidth={1.5}
              />
              {commissionValues.map((v, i) => (
                <Circle
                  key={i}
                  cx={toX(i)}
                  cy={toY(v)}
                  r={3.5}
                  fill="#FFF"
                  stroke={Colors.primary}
                  strokeWidth={1.5}
                />
              ))}
            </>
          )}
          {xTickIdx.map((idx) => (
            <SvgText
              key={`x${idx}`}
              x={toX(idx)}
              y={H - 6}
              fontSize={8}
              fill="#AAA"
              textAnchor="middle"
            >
              {monthDay(series[idx].date)}
            </SvgText>
          ))}
        </Svg>
        {/* Legend */}
        <View style={styles.chartLegendRow}>
          <View style={styles.chartLegendItem}>
            <View style={styles.chartLegendDot} />
            <Text style={styles.chartLegend}>
              {hasData ? `${periodLabel} commission` : "No data"}
            </Text>
          </View>
        </View>
      </View>

      {/* Income Composition */}
      <Text style={styles.compositionTitle}>Income Compositon</Text>

      {/* Host commission row */}
      <View style={styles.compositionItemRow}>
        <View style={styles.medalIcon}>
          <Ionicons name="medal" size={18} color="#FFB800" />
          <Text style={styles.medalRank}>1</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.compositionLabel}>
            Host Commission:{" "}
            <Text style={{ fontWeight: "700" }}>{direct.toLocaleString()}</Text>
          </Text>
          <View style={styles.compositionBarRow}>
            <View
              style={[
                styles.compositionBarFill,
                { width: `${directPct}%`, backgroundColor: "#FF6B9D" },
              ]}
            />
            <View style={[styles.compositionBarEmpty, { flex: 1 }]} />
          </View>
        </View>
        <Text style={styles.compositionPercent}>{directPct}%</Text>
      </View>

      {/* Invite agent commission row */}
      <View style={[styles.compositionItemRow, { marginTop: Spacing.md }]}>
        <View style={styles.medalIcon}>
          <Ionicons name="medal" size={18} color="#AAA" />
          <Text style={styles.medalRank}>2</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.compositionLabel}>
            Invite agent Commission:{" "}
            <Text style={{ fontWeight: "700" }}>{invite.toLocaleString()}</Text>
          </Text>
          <View style={styles.compositionBarRow}>
            <View
              style={[
                styles.compositionBarFill,
                { width: `${invitePct}%`, backgroundColor: "#22D4C8" },
              ]}
            />
            <View style={[styles.compositionBarEmpty, { flex: 1 }]} />
          </View>
        </View>
        <Text style={styles.compositionPercent}>{invitePct}%</Text>
      </View>
    </View>
  );
}

// ── Helper Components ───────────────────────────────────────────────────────

function ToolButton({
  icon,
  label,
  color,
  source,
  tint,
  onPress,
}: {
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  color?: string;
  source?: number;
  tint?: string;
  onPress: () => void;
}) {
  const hasBg = !!(tint ?? color);
  return (
    <TouchableOpacity style={styles.toolBtn} onPress={onPress}>
      <View
        style={[styles.toolIcon, hasBg && { backgroundColor: tint ?? color }]}
      >
        {source ? (
          <Image
            source={source}
            style={hasBg ? styles.toolIconImg : styles.toolIcon}
            contentFit="contain"
          />
        ) : icon ? (
          <Ionicons name={icon} size={20} color="#FFF" />
        ) : null}
      </View>
      <Text style={styles.toolLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function SquareToolBtn({
  icon,
  imageSource,
  label,
  bg,
  iconColor,
  onPress,
}: {
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  imageSource?: number;
  label: string;
  bg: string;
  iconColor?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.squareToolBtn} onPress={onPress}>
      <View style={[styles.squareToolIcon, { backgroundColor: bg }]}>
        {imageSource != null ? (
          <Image
            source={imageSource}
            style={styles.squareToolIconImgReward}
            contentFit="contain"
          />
        ) : icon ? (
          <Ionicons name={icon} size={22} color={iconColor ?? Colors.primary} />
        ) : null}
      </View>
      <Text style={styles.squareToolLabel} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function IncentiveSquareBtn({
  label,
  bg,
  imageSource,
  slotValue,
  onPress,
}: {
  label: string;
  bg: string;
  imageSource?: number;
  /** When set, shows only this count in the tile (e.g. base salary hosts). */
  slotValue?: number;
  onPress?: () => void;
}) {
  const Wrapper: React.ElementType = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={styles.incentiveItem} onPress={onPress}>
      <View style={[styles.incentiveSquare, { backgroundColor: bg }]}>
        {slotValue != null ? (
          <Text style={styles.incentiveFundsValue}>
            {slotValue.toLocaleString()}
          </Text>
        ) : imageSource != null ? (
          <Image
            source={imageSource}
            style={styles.incentiveSquareImage}
            contentFit="contain"
          />
        ) : null}
      </View>
      <Text style={styles.incentiveLabel}>{label}</Text>
    </Wrapper>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCell}>
      <Text style={styles.metricCellLabel}>{label}</Text>
      <Text style={styles.metricCellValue}>{value}</Text>
    </View>
  );
}

function DataCell({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.dataCell}>
      <Text style={styles.dataCellLabel}>{label}</Text>
      <Text style={styles.dataCellValue}>{value.toLocaleString()}</Text>
    </View>
  );
}

function PromoItem({ promotion }: { promotion: AgencyLearnPromotion }) {
  const hasLink = Boolean(promotion.linkUrl?.trim());
  return (
    <TouchableOpacity
      style={[styles.promoRow, !hasLink && styles.promoRowDisabled]}
      activeOpacity={hasLink ? 0.7 : 1}
      disabled={!hasLink}
      onPress={() => openPromotionLink(promotion.linkUrl)}
    >
      <View style={styles.promoIcon}>
        <Image
          source={{ uri: promotion.imageUrl }}
          style={styles.promoImage}
          contentFit="cover"
        />
      </View>
      <View style={styles.promoInfo}>
        <Text style={styles.promoTitle} numberOfLines={1}>
          {promotion.title}
        </Text>
        <Text style={styles.promoSubtitle} numberOfLines={1}>
          {promotion.description}
        </Text>
        <View style={styles.promoStats}>
          <Ionicons name="eye-outline" size={12} color={Colors.textTertiary} />
          <Text style={styles.promoStatText}>
            {promotion.viewCount.toLocaleString()}
          </Text>
          <Ionicons name="heart-outline" size={12} color={Colors.textTertiary} />
          <Text style={styles.promoStatText}>
            {promotion.likeCount.toLocaleString()}
          </Text>
        </View>
      </View>
      {promotion.tag ? (
        <View style={styles.promoTag}>
          <Text style={styles.promoTagText}>{promotion.tag}</Text>
        </View>
      ) : null}
      {hasLink ? (
        <Ionicons
          name="chevron-forward"
          size={16}
          color={Colors.textTertiary}
          style={styles.promoChevron}
        />
      ) : null}
    </TouchableOpacity>
  );
}

// ── Invite host bottom sheet ────────────────────────────────────────────────

function InviteHostSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = useCallback(async () => {
    if (!query.trim() || sending) return;
    setSending(true);
    try {
      await hostApplicationApi.inviteUser(query.trim());
      Alert.alert(
        "Invitation Sent",
        `Host invitation sent to "${query.trim()}".`,
      );
      setQuery("");
      onClose();
    } catch (e: unknown) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Could not send invitation.",
      );
    } finally {
      setSending(false);
    }
  }, [query, sending, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View
        style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}
      >
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Invite a Host</Text>
        <Text style={styles.sheetHint}>Enter username or Haka ID</Text>
        <TextInput
          style={styles.sheetInput}
          value={query}
          onChangeText={setQuery}
          placeholder="@username or ID"
          placeholderTextColor="#999"
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={[
            styles.sheetBtn,
            (!query.trim() || sending) && styles.sheetBtnDisabled,
          ]}
          onPress={handleSend}
          disabled={!query.trim() || sending}
        >
          <Text style={styles.sheetBtnText}>Send Invitation</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  errorText: { color: "#999", fontSize: 14 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  agentBadgeImg: {
    width: 32,
    height: 32,
  },

  // Profile card
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    justifyContent: "space-between",
    gap: Spacing.md,
    overflow: "visible",
  },
  profileLeft: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: Spacing.xs,
    flexShrink: 1,
  },
  avatarWrapper: {
    position: "relative",
  },
  tierLetterBadge: {
    width: 31,
    height: 26,
    borderRadius: 20,
    backgroundColor: "#176ED8",
    alignItems: "center",
    justifyContent: "center",
  },
  tierLetterText: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
    color: "#FFF",
    textAlign: "center",
  },
  profileInfo: { flex: 1, gap: Spacing.xs },
  profileNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  profileName: {
    fontSize: 30,
    fontWeight: "600",
    lineHeight: 45,
    color: "#000",
  },
  coinSellerBadgeImg: {
    width: 89,
    height: 26,
  },
  profileBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },

  // Tier ring widget — glass card wraps donut + next-tier copy when a next tier exists
  tierRingContainer: {
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 1,
    maxWidth: "100%",
    backgroundColor: "transparent",
    overflow: "visible",
  },
  tierRingOuter: {
    alignItems: "center",
    justifyContent: "center",
  },
  tierRingDonutPressed: {
    opacity: 0.88,
  },
  tierRingInnerAbs: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  tierRingPctSingle: {
    textAlign: "center",
  },
  tierRingPctNum: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.primary,
    lineHeight: 24,
  },
  tierRingPctSymbol: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.primary,
    lineHeight: 18,
    marginBottom: 1,
  },
  tierRingGlassOuter: {
    backgroundColor: "transparent",
  },
  tierRingGlassVeil: {
    backgroundColor: "transparent",
  },
  // Tier next-level card — image-backed glass (tier_glass_card.png)
  liquidShadowWrap: {
    flexShrink: 1,
    maxWidth: "100%",
    marginLeft: Spacing.lg,
    alignSelf: "flex-end",
    backgroundColor: "transparent",
  },
  liquidShadowWrapMax: {
    transform: [{ scale: 0.86 }],
    transformOrigin: "right center",
  },
  liquidCard: {
    flexShrink: 1,
    maxWidth: "100%",
    minHeight: 78,
    borderRadius: 15,
    overflow: "hidden",
    justifyContent: "center",
  },
  liquidCardMax: {
    minHeight: 68,
  },
  liquidCardBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 15,
  },
  tierRingGlassContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    flexShrink: 1,
    backgroundColor: "transparent",
  },
  tierRingInfo: {
    gap: 2,
    alignItems: "flex-start",
    flexShrink: 1,
    minWidth: 0,
    backgroundColor: "transparent",
  },
  tierRingInfoSizer: {
    opacity: 0,
  },
  tierRingNextPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.primarySubtle,
  },
  tierRingNextArrow: {
    width: 14,
    height: 14,
  },
  tierRingNext: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 16,
    color: Colors.textPrimary,
  },
  tierRingRequiresRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "transparent",
  },
  tierRingRequiresTextCol: {
    flexDirection: "column",
    gap: 0,
    backgroundColor: "transparent",
  },
  tierRingRequiresText: {
    fontSize: 11,
    fontWeight: "400",
    lineHeight: 13,
    color: Colors.textSecondary,
  },
  tierRingCoin: {
    width: 16,
    height: 16,
  },
  tierRingValue: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 17,
    color: Colors.primary,
    alignSelf: "flex-start",
  },
  tierRingChevron: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: "700",
  },

  // Tabs
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  tab: {
    marginRight: Spacing.xl,
    paddingVertical: Spacing.sm,
    alignItems: "center",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#999",
  },
  tabTextActive: {
    color: "#000",
    fontWeight: "600",
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#000",
    borderRadius: 1,
  },

  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: Spacing.lg,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  statusBannerSuspended: {
    backgroundColor: "#d97706",
  },
  statusBannerBanned: {
    backgroundColor: "#dc2626",
  },
  statusBannerText: {
    flex: 1,
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },

  tabContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: 40,
  },

  // Earned today row
  earningsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#CFE0FF",
    marginBottom: Spacing.lg,
    overflow: "hidden",
  },
  earningsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  earningsCol: {
    flex: 1,
    gap: Spacing.xs,
  },
  earningsLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  earningsLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#0B0B14",
  },
  earningsCoin: {
    width: 18,
    height: 18,
  },
  earningsValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0B0B14",
  },
  pointsWalletCaption: {
    fontSize: 11,
    fontWeight: "400",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  earningsDivider: {
    width: 1,
    backgroundColor: "#E0E0E0",
    marginHorizontal: Spacing.md,
  },
  withdrawPill: {
    backgroundColor: "#0088FF",
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.full,
    marginLeft: "auto",
  },
  withdrawPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFF",
  },
  accumulatedBar: {
    backgroundColor: "#E8F0FF",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  accumulatedBarText: {
    fontSize: 14,
    color: "#0B0B14",
  },
  accumulatedBarValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0B0B14",
  },

  // Commission tier journey
  tierCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  tierSection: {
    position: "relative",
    alignSelf: "stretch",
  },
  tierMarkersRow: {
    position: "relative",
    minHeight: 20,
    alignSelf: "stretch",
  },
  tierMarkersRowPct: {
    marginBottom: Spacing.xs,
  },
  tierMarker: {
    position: "absolute",
    top: 0,
  },
  tierTrackWrapper: {
    position: "relative",
    height: 20,
    justifyContent: "center",
    marginVertical: Spacing.xs,
    alignSelf: "stretch",
  },
  tierDotMarker: {
    position: "absolute",
    top: "50%",
    marginTop: -TIER_DOT_RADIUS,
  },
  tierThresholdCell: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    maxWidth: "100%",
  },
  tierThresholdCellCompact: {
    gap: 2,
  },
  tierCoin: {
    width: 14,
    height: 14,
    flexShrink: 0,
  },
  tierCoinCompact: {
    width: 12,
    height: 12,
  },
  tierNoteWrapper: {
    marginTop: Spacing.md,
  },
  tierNoteRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  tierNoteCoin: {
    width: 14,
    height: 14,
    marginRight: 4,
  },
  tierColumns: {
    flexDirection: "row",
  },
  tierColumn: {
    flex: 1,
    alignItems: "center",
    position: "relative",
  },
  tierLabel: {
    fontSize: 13,
    color: "#0B0B14",
    fontWeight: "500",
    textAlign: "center",
    backgroundColor: "transparent",
    maxWidth: "100%",
  },
  tierLabelCompact: {
    fontSize: 11,
  },
  tierLabelActive: {
    color: "#FF4D4D",
    fontWeight: "700",
  },
  tierThresholdLabel: {
    fontSize: 13,
    color: "#0B0B14",
    fontWeight: "500",
    textAlign: "center",
    backgroundColor: "transparent",
    flexShrink: 1,
  },
  tierThresholdLabelCompact: {
    fontSize: 11,
  },
  tierDotSlot: {
    height: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  tierTrackRow: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    paddingHorizontal: "12.5%",
  },
  tierTrack: {
    height: 8,
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: Colors.surfaceHighlight,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  tierFill: {
    height: 8,
    backgroundColor: "#FF2D55",
    borderRadius: Radius.full,
  },
  tierDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#FF2D55",
    borderWidth: 2,
    borderColor: "#FFF",
  },
  tierDotActive: {
    backgroundColor: "#FF2D55",
  },
  tierNote: {
    fontSize: 14,
    color: "#0B0B14",
    lineHeight: 20,
  },
  tierNoteHighlight: {
    fontSize: 14,
    color: "#0B0B14",
    fontWeight: "700",
  },

  // Leaderboard banner
  leaderboardBanner: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.xl,
    minHeight: 80,
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFF",
    textAlign: "center",
  },
  bannerDate: {
    fontSize: 12,
    color: "rgba(255,255,255,0.85)",
    marginTop: 4,
    textAlign: "center",
  },

  // Section title
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000",
    marginBottom: Spacing.md,
  },

  // Tools grid
  toolsCard: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 15,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
  },
  toolsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    rowGap: Spacing.md,
  },
  toolBtn: {
    width: "25%",
    alignItems: "center",
    gap: Spacing.sm,
  },
  toolIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  toolIconImg: {
    width: 28,
    height: 28,
  },
  toolLabel: {
    fontSize: 11,
    color: "#666",
    textAlign: "center",
  },

  // Agent reward
  agentRewardBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#F8F8F8",
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  agentRewardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(95, 34, 217, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  agentRewardIconImg: {
    width: 24,
    height: 24,
  },
  agentRewardText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000",
  },

  // Promo list
  promoList: { gap: Spacing.md, marginBottom: Spacing.xl },
  promoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  promoRowDisabled: { opacity: 0.85 },
  promoIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceHighlight,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  promoImage: { width: 44, height: 44 },
  promoChevron: { marginLeft: Spacing.xs },
  promoPlaceholder: { backgroundColor: Colors.surfaceHighlight },
  promoPlaceholderBar: {
    height: 14,
    borderRadius: Radius.xs,
    backgroundColor: Colors.surfaceHighlight,
  },
  promoInfo: { flex: 1, gap: 2 },
  promoTitle: { fontSize: 13, fontWeight: "600", color: "#000" },
  promoSubtitle: { fontSize: 11, color: "#999" },
  promoStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: 2,
  },
  promoStatText: { fontSize: 10, color: "#999" },
  promoTag: {
    backgroundColor: "#FF6B00",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  promoTagText: { fontSize: 9, fontWeight: "700", color: "#FFF" },

  // ── Manage tab ──
  manageCard: {
    backgroundColor: "#F8F8F8",
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  incentiveCardGold: {
    backgroundColor: Colors.background,
    borderWidth: 2,
    borderColor: Colors.gold,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.lg,
  },
  incentiveCardNeutral: {
    backgroundColor: Colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderLight,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.lg,
  },
  incentiveCardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
  incentiveItemsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  incentiveItem: {
    flex: 1,
    alignItems: "center",
    gap: Spacing.sm,
  },
  incentiveSquare: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  incentiveSquareImage: {
    width: 28,
    height: 28,
  },
  incentiveHostSlotIcon: {
    width: 24,
    height: 24,
  },
  incentiveFundsSlot: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  incentiveFundsValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#E8A020",
  },
  incentiveLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#000",
    textAlign: "center",
  },
  inviteAgentCard: {
    backgroundColor: Colors.background,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderLight,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.lg,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 0,
  },
  chartCard: {
    backgroundColor: Colors.background,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderLight,
    padding: Spacing.lg,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 0,
  },

  // Square tool buttons (Platform Reward / Money-making tools)
  toolsGridWrap: {
    flexDirection: "row",
    gap: Spacing.xl,
    marginBottom: Spacing.md,
  },
  squareToolBtn: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  squareToolIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  squareToolIconImgReward: {
    width: 28,
    height: 28,
  },
  squareToolLabel: {
    fontSize: 10,
    color: "#666",
    textAlign: "center",
    lineHeight: 13,
  },

  // ── Data tab ──
  dataSubTabs: {
    flexDirection: "row",
    gap: 0,
    marginBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  dataSubTab: {
    marginRight: Spacing.xl,
    paddingBottom: Spacing.sm,
    alignItems: "center",
    position: "relative",
  },
  dataSubTabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#000",
    borderRadius: 1,
  },
  dataSubTabText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#999",
  },
  dataSubTabTextActive: {
    color: "#000",
    fontWeight: "700",
  },
  dataSection: { gap: Spacing.md },
  dataHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dataTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  dataTitle: { fontSize: 15, fontWeight: "700", color: "#000" },
  dataRefresh: { fontSize: 11, color: "#999" },
  dataSubtitle: { fontSize: 11, color: "#999" },
  dataGrid: { gap: Spacing.md },
  dataGridRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  dataCell: { flex: 1 },
  dataCellLabel: { fontSize: 11, color: "#999", marginBottom: 2 },
  dataCellValue: { fontSize: 16, fontWeight: "700", color: "#000" },

  // Period picker
  periodPicker: {
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  periodPickerText: {
    fontSize: 11,
    color: "#555",
  },

  // Metrics card (3×2 grid with dividers)
  metricsCard: {
    borderWidth: 1,
    borderColor: "#F0F0F0",
    borderRadius: Radius.md,
    overflow: "hidden",
    backgroundColor: "#FFF",
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: Spacing.md,
  },
  metricsDividerH: {
    height: 1,
    backgroundColor: "#F0F0F0",
  },
  metricsDividerV: {
    width: 1,
    backgroundColor: "#F0F0F0",
    alignSelf: "stretch",
  },
  metricCell: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    gap: 4,
  },
  metricCellLabel: {
    fontSize: 10,
    color: "#999",
    textAlign: "center",
    lineHeight: 14,
  },
  metricCellValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000",
    textAlign: "center",
  },

  // Chart legend
  chartLegend: {
    fontSize: 11,
    color: "#999",
    textAlign: "center",
    marginTop: 4,
  },

  // Host overview
  hostOverviewCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFE3EC",
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  hostOverviewLabel: { fontSize: 13, color: "#000", flex: 1 },
  hostOverviewValue: { fontSize: 22, fontWeight: "700", color: "#E8A020" },
  managePill: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  managePillText: { fontSize: 11, fontWeight: "600", color: "#FFF" },

  // Income analysis
  incomeToggleRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  incomeToggle: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  incomeToggleActive: {
    backgroundColor: "#000",
    borderColor: "#000",
  },
  incomeToggleText: { fontSize: 12, color: "#666" },
  incomeToggleTextActive: { fontSize: 12, color: "#FFF", fontWeight: "600" },
  incomeValueRow: {
    flexDirection: "row",
    gap: Spacing.xxl,
    marginTop: Spacing.sm,
  },
  incomeMainValue: { fontSize: 22, fontWeight: "700", color: "#000" },
  incomeHistValue: { fontSize: 22, fontWeight: "700", color: "#999" },

  // Composition
  compositionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#000",
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  compositionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  compositionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  compositionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  compositionLabel: { fontSize: 12, color: "#666" },
  compositionPercent: { fontSize: 12, fontWeight: "600", color: "#000" },
  compositionBar: {
    height: 8,
    backgroundColor: "#F0F0F0",
    borderRadius: Radius.full,
    overflow: "hidden",
    marginBottom: Spacing.md,
  },
  compositionFill: {
    height: 8,
    borderRadius: Radius.full,
  },

  // ── Host analysis ──
  hostAnalysisCard: {
    backgroundColor: Colors.background,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderLight,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 0,
  },
  hostOverviewIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FF6B9D",
    alignItems: "center",
    justifyContent: "center",
  },
  manageOutlinePill: {
    borderWidth: 1.5,
    borderColor: "#FF6B9D",
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  manageOutlinePillText: {
    fontSize: 12,
    color: "#FF6B9D",
    fontWeight: "600",
  },
  gradeSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#000",
    marginBottom: Spacing.xs,
  },
  gradeSubtitle: {
    fontSize: 12,
    color: "#666",
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  gradePillsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  gradePill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    backgroundColor: "#F8F8F8",
    alignItems: "center",
    justifyContent: "center",
  },
  gradePillText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
  },
  dayStatsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  dayStatCard: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  dayStatLabel: {
    fontSize: 12,
    color: "#666",
  },
  dayStatValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000",
  },

  // ── Income analysis ──
  incomeCardsRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  incomeCard: {
    flex: 1,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    gap: Spacing.xs,
    minHeight: 80,
    justifyContent: "space-between",
  },
  incomeCardLabel: {
    fontSize: 13,
    color: "#555",
  },
  incomeCardValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#000",
  },
  chartLegendRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: Spacing.xs,
  },
  chartLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  chartLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: "#FFF",
  },
  compositionItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  medalIcon: {
    width: 30,
    alignItems: "center",
  },
  medalRank: {
    fontSize: 9,
    color: "#FFF",
    fontWeight: "700",
    position: "absolute",
    bottom: 2,
  },
  compositionBarRow: {
    flexDirection: "row",
    height: 8,
    borderRadius: Radius.full,
    overflow: "hidden",
    backgroundColor: "#F0F0F0",
  },
  compositionBarFill: {
    height: 8,
    borderRadius: Radius.full,
  },
  compositionBarEmpty: {
    height: 8,
  },

  // Commission tier journey overlay (header donut → ladder matching gift-bonus layout)
  commissionJourneyOverlayRoot: {
    flex: 1,
  },
  commissionJourneyBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  commissionJourneyCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  commissionJourneyCenterNarrow: {
    paddingHorizontal: Spacing.md,
  },
  commissionJourneyCard: {
    width: "100%" as const,
    maxWidth: 400,
    backgroundColor: Colors.background,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  commissionJourneyCardNarrow: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  commissionJourneyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.textPrimary,
    textAlign: "center",
  },
  commissionJourneySubtitle: {
    fontSize: 13,
    fontWeight: "400",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  commissionJourneyTierCard: {
    marginBottom: 0,
  },
  commissionJourneyCloseBtn: {
    marginTop: Spacing.xs,
    height: 48,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  commissionJourneyCloseText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.textInverse,
  },

  // Invite sheet
  sheetBackdrop: { flex: 1, backgroundColor: "transparent" },
  sheet: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E0E0E0",
    alignSelf: "center",
    marginBottom: Spacing.sm,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#000",
    textAlign: "center",
  },
  sheetHint: { fontSize: 13, color: "#999", textAlign: "center" },
  sheetInput: {
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: Radius.md,
    height: 52,
    paddingHorizontal: Spacing.lg,
    color: "#000",
    fontSize: 15,
  },
  sheetBtn: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetBtnDisabled: { opacity: 0.45 },
  sheetBtnText: { fontSize: 15, fontWeight: "700", color: "#FFF" },
  monthlyStatsRow: {
    flexDirection: "row",
    gap: 16,
    paddingTop: 8,
    paddingHorizontal: 4,
  },
  monthlyStatItem: { fontSize: 12, color: "#666" },
  monthlyStatValue: { fontWeight: "700", color: "#000" },
});
