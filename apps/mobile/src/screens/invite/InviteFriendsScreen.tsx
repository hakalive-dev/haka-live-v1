import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { DimensionValue } from "react-native";
import {
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSelector } from "react-redux";

import { invitesApi } from "@api/invites";
import { buildInviteShareMessage } from "../../invite/buildInviteShareMessage";
import type { RootState } from "../../store";
import { Colors, Spacing, Radius } from "@/theme";
import type { InvitationSummary } from "@/types";
import type { RootStackParamList } from "@navigation/types";

const BEAN_IMAGE = require("../../../assets/bean.png");
const BANNER_IMAGE = require("../../../assets/invites/invite_hero_controller.png");
/** Trimmed @1x asset aspect (218×134). */
const HERO_CONTROLLER_ASPECT = 134 / 218;
/** ~82% of screen width — matches Figma hero scale. */
const HERO_CONTROLLER_WIDTH_RATIO = 0.82;
const GAME_REBATE_STAR = require("../../../assets/invites/game_rebate_star.png");
const GAME_REBATE_TIERS = require("../../../assets/invites/game_rebate_tiers.png");
const SHAREHOLDER_BONUS_CARD = require("../../../assets/invites/shareholder_bonus_card.png");
const TREASURE_IMAGE = require("../../../assets/invites/treasure_chest.png");

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Fullscreen background — Figma: linear-gradient(177.18deg, #FE6ADE, #FCCCE1) */
const INVITE_SCREEN_BG = ["#FE6ADE", "#FCCCE1"] as [string, string];

/** Invite Friends screen palette (Figma export). */
const INVITE = {
  accentPurple: "#CF11CF",
  gameRewardRed: "#F22225",
  commissionMagenta: "#B8137C",
  collectPurple: "#C93AD1",
  ctaRed: "#FC1818",
  progressRed: "#FF2D55",
  progressTrack: "#B22A2A",
  rankRed: "#FE3235",
  starYellow: "#FACB1B",
  starPctRed: "#EC1013",
  cardGlass: "rgba(255, 255, 255, 0.33)",
  cardGlassLight: "rgba(255, 255, 255, 0.44)",
  shareholderShell: ["rgba(255, 255, 255, 0.171)", "rgba(255, 255, 255, 0.57)"] as [
    string,
    string,
  ],
  rulesGrad: ["rgba(223, 20, 91, 0.91)", "rgba(225, 19, 19, 0.84)"] as [
    string,
    string,
  ],
  betsInfoBg: "rgba(255, 171, 235, 0.5)",
  commissionBg: "rgba(244, 12, 201, 0.27)",
  collectBg: "rgba(255, 255, 255, 0.5)",
} as const;

const POPPINS = "Poppins";

const DEFAULT_GAME_REBATE_PERCENT = 0.5;

function formatGameRebatePercent(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1);
  return `${text}%`;
}

/** Current game rebate % from invitee tiers; defaults to 0.5% until API returns a value. */
function resolveGameRebatePercent(data: InviteFriendsShareData): number {
  const fromInvitees = Math.max(data.tier1Rebate, data.tier2Rebate);
  const resolved = Math.max(data.currentRebate, fromInvitees);
  return resolved > 0 ? resolved : DEFAULT_GAME_REBATE_PERCENT;
}

/** Mapped from invite summary + wallet; rebate-only fields stay 0 until APIs exist. */
type InviteFriendsShareData = {
  globalBonus: number;
  joinCount: number;
  divideCount: number;
  currentRebate: number;
  historicalMax: number;
  validBets30d: number;
  needToProgress: number;
  realtimeCommission: number;
  totalReward: number;
  shareholderBonus: number;
  tier1Rebate: number;
  tier2Rebate: number;
};

function buildShareData(
  summary: InvitationSummary | null,
): InviteFriendsShareData {
  const totalReward = summary?.total_rewards ?? 0;
  const wallet = summary?.wallet_balance ?? 0;
  const totalInv = summary?.total_invitations ?? 0;
  const accepted = summary?.accepted_invitations ?? 0;
  const pendingUnlock = summary?.rewards_to_unlock ?? 0;

  return {
    globalBonus: totalReward,
    joinCount: totalInv,
    divideCount: accepted,
    currentRebate: summary?.game_rebate_percent ?? 0,
    historicalMax: 0,
    validBets30d: 0,
    needToProgress: 0,
    realtimeCommission: pendingUnlock,
    totalReward,
    shareholderBonus: wallet,
    tier1Rebate: summary?.tier1_game_rebate_percent ?? 0,
    tier2Rebate: summary?.tier2_game_rebate_percent ?? 0,
  };
}

const REBATE_TIERS = [
  { pct: "0.1%", amount: "0" },
  { pct: "0.2%", amount: "10M" },
  { pct: "0.3%", amount: "100M" },
  { pct: "0.4%", amount: "400M" },
  { pct: "0.5%", amount: "700M" },
];

function getInvitePeriodLabel(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

function getRebateTierFillIndex(percent: number): number {
  if (percent >= 0.5) return 4;
  if (percent >= 0.4) return 3;
  if (percent >= 0.3) return 2;
  if (percent >= 0.2) return 1;
  return 0;
}

// ── InviteFriendsScreen ─────────────────────────────────────────────────────

export function InviteFriendsScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const myHakaId = useSelector((state: RootState) => state.auth.user?.hakaId);

  const heroGraphicSize = useMemo(() => {
    const width = Math.round(
      Math.min(screenWidth - Spacing.md * 2, screenWidth * HERO_CONTROLLER_WIDTH_RATIO),
    );
    const height = Math.round(width * HERO_CONTROLLER_ASPECT);
    return { width, height };
  }, [screenWidth]);

  const [summary, setSummary] = useState<InvitationSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  useEffect(() => {
    invitesApi
      .getSummary()
      .then(setSummary)
      .catch(() => {})
      .finally(() => setSummaryLoading(false));
  }, []);

  const shareData = useMemo(() => buildShareData(summary), [summary]);
  const gameRebatePercent = useMemo(
    () => resolveGameRebatePercent(shareData),
    [shareData],
  );

  const handleInvite = useCallback(async () => {
    if (!myHakaId) {
      Alert.alert(
        "Haka ID unavailable",
        "Complete your profile setup before sharing your invite ID.",
      );
      return;
    }
    try {
      await Share.share({
        message: buildInviteShareMessage(myHakaId),
      });
    } catch {
      // cancelled or network
    }
  }, [myHakaId]);

  const handleCollect = useCallback(() => {
    Alert.alert(
      "Invite rewards",
      "Rewards from invites are credited automatically when a friend accepts your code.",
    );
  }, []);

  const handleRules = useCallback(() => {
    Alert.alert(
      "Invite Friends rules",
      "Invite friends to play games and earn shareholder bonuses and game rebates. Full rules will be available soon.",
    );
  }, []);

  const formatNumber = (n: number) => n.toLocaleString();

  return (
    <LinearGradient
      colors={INVITE_SCREEN_BG}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.screen}
    >
      <View style={[styles.headerBar, { paddingTop: insets.top }]}>
        <View style={styles.headerContent}>
          <TouchableOpacity hitSlop={8} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color="rgba(0,0,0,0.7)" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Invite Friends</Text>
          <View style={styles.headerSpacer} />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      >
        <View style={styles.heroBlock}>
          <View style={styles.bannerCard}>
            <Image
              source={BANNER_IMAGE}
              style={[styles.bannerImage, heroGraphicSize]}
              contentFit="contain"
              allowDownscaling
              transition={200}
            />
          </View>

          <TouchableOpacity
            style={styles.rulesPillWrap}
            onPress={handleRules}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={INVITE.rulesGrad}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.rulesPill}
            >
              <Ionicons name="help-circle-outline" size={14} color="#FFFFFF" />
              <Text style={styles.rulesPillText}>Rules</Text>
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.bannerSubtitleBelow}>
            Invite Friends to Play Games
          </Text>
        </View>

        <LinearGradient
          colors={INVITE.shareholderShell}
          style={styles.shareholderOuterCard}
        >
          <Text style={styles.peachCardTitle}>Global Shareholder Bonus</Text>
          <Text style={styles.peachCardSub}>
            share the following point bonus
          </Text>

          <View style={styles.shareholderGlassCard}>
            <View style={styles.shareholderBonusCard}>
              <Image
                source={SHAREHOLDER_BONUS_CARD}
                style={styles.shareholderBonusBg}
                contentFit="fill"
              />
              <View style={styles.bonusNumberBlock}>
                <Text style={styles.bonusNumber}>
                  {summaryLoading ? "—" : formatNumber(shareData.globalBonus)}
                </Text>
              </View>

              <View style={styles.shareholderFooter}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tickerScrollContent}
                >
                  <View style={styles.tickerChip}>
                    <View style={styles.tickerCoinRing}>
                      <Image
                        source={BEAN_IMAGE}
                        style={styles.tickerCoin}
                        contentFit="contain"
                      />
                    </View>
                    <Text style={styles.tickerTextOnGlass}>
                      {summaryLoading ? "—" : formatNumber(shareData.joinCount)}
                    </Text>
                  </View>
                  <View style={styles.tickerChip}>
                    <View style={styles.tickerAvatar} />
                    <Text style={styles.tickerTextOnGlass}>Accepted</Text>
                    <Ionicons
                      name="heart"
                      size={12}
                      color="#FFFFFF"
                      style={styles.tickerHeart}
                    />
                  </View>
                  <Text style={styles.tickerDividerOnGlass}>Divided</Text>
                  <View style={styles.tickerChip}>
                    <View style={styles.tickerCoinRing}>
                      <Image
                        source={BEAN_IMAGE}
                        style={styles.tickerCoin}
                        contentFit="contain"
                      />
                    </View>
                    <Text style={styles.tickerTextOnGlass}>
                      {summaryLoading
                        ? "—"
                        : formatNumber(shareData.divideCount)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.tickerRankPillGlass}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.tickerRankTextGlass}>Rank {">"}</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.rebateCardWrapper}>
          <View style={styles.rebateCardBody}>
            <View style={styles.rebateCopy}>
              <Text style={styles.rebateTitle}>Game Rebate</Text>
              <Text style={styles.rebateSubLine}>Up to 0.5% of 2 tier</Text>
              <Text style={styles.rebateSubLine}>Invitee bets</Text>
            </View>
            <View style={styles.rebateHierarchy}>
              <Image
                source={GAME_REBATE_TIERS}
                style={styles.rebateTiersImage}
                contentFit="contain"
              />
              <View style={styles.rebateStarWrap}>
                <Image
                  source={GAME_REBATE_STAR}
                  style={styles.rebateStarImage}
                  contentFit="contain"
                />
                <Text style={styles.rebateStarPct}>
                  {formatGameRebatePercent(gameRebatePercent)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.inviteBtn}
          onPress={handleInvite}
          activeOpacity={0.85}
        >
          <Text style={styles.inviteBtnText}>Invite Friends</Text>
        </TouchableOpacity>

        <View style={styles.mainCard}>
          <View style={styles.bonusCornerRow}>
            <Text style={styles.bonusCornerLabel}>Shareholder Bonus</Text>
            <Text style={[styles.bonusCornerLabel, styles.bonusCornerLabelRight]}>
              Game Rebate
            </Text>
          </View>

          <View style={styles.mainCardInner}>
            <InviteBonusCardContent
              data={shareData}
              gameRebatePercent={gameRebatePercent}
              summaryLoading={summaryLoading}
              onCollect={handleCollect}
              formatNumber={formatNumber}
            />
          </View>

          <RealtimeCommissionCard
            data={shareData}
            summaryLoading={summaryLoading}
            onCollect={handleCollect}
            formatNumber={formatNumber}
          />
        </View>

        <View style={styles.rewardSection}>
          <View style={styles.rewardHeader}>
            <Text style={styles.rewardTitle}>Reward Data</Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation.navigate("InviteRewardDetails")}
            >
              <Text style={styles.detailsLink}>Details {">"}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.rewardInnerCard}>
          <View style={styles.rewardRow}>
            <Text style={styles.rewardLabelStrong}>Total Reward</Text>
            <View style={styles.rewardValueRow}>
              <Image
                source={BEAN_IMAGE}
                style={styles.coinIcon}
                contentFit="contain"
              />
              <Text style={styles.rewardValue}>
                {summaryLoading ? "—" : formatNumber(shareData.totalReward)}
              </Text>
            </View>
          </View>
          <View style={styles.rewardRow}>
            <Text style={styles.rewardLabel}>Shareholder Bonus</Text>
            <View style={styles.rewardValueRow}>
              <Image
                source={BEAN_IMAGE}
                style={styles.coinIcon}
                contentFit="contain"
              />
              <Text style={styles.rewardValue}>
                {summaryLoading
                  ? "—"
                  : formatNumber(shareData.shareholderBonus)}
              </Text>
            </View>
          </View>
          <View style={styles.rewardRow}>
            <Text style={styles.rewardLabel}>Tier 1 Game Rebate</Text>
            <View style={styles.rewardValueRow}>
              <Image
                source={BEAN_IMAGE}
                style={styles.coinIcon}
                contentFit="contain"
              />
              <Text style={styles.rewardValue}>
                {summaryLoading ? "—" : formatNumber(shareData.tier1Rebate)}
              </Text>
            </View>
          </View>
          <View style={styles.rewardRow}>
            <Text style={styles.rewardLabel}>Tier 2 Game Rebate</Text>
            <View style={styles.rewardValueRow}>
              <Image
                source={BEAN_IMAGE}
                style={styles.coinIcon}
                contentFit="contain"
              />
              <Text style={styles.rewardValue}>
                {summaryLoading ? "—" : formatNumber(shareData.tier2Rebate)}
              </Text>
            </View>
          </View>
          </View>

          <TouchableOpacity style={styles.myInvitationRow} activeOpacity={0.85}>
            <Text style={styles.myInvitationText}>My Invitation {">"}</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </LinearGradient>
  );
}

// ── Shared bonus / rebate panel (Figma) ─────────────────────────────────────

type BonusTabPanelProps = {
  data: InviteFriendsShareData;
  gameRebatePercent: number;
  summaryLoading: boolean;
  onCollect: () => void;
  formatNumber: (n: number) => string;
};

function GameRebatePanel({
  data,
  gameRebatePercent,
  summaryLoading,
  formatNumber,
}: Omit<BonusTabPanelProps, "onCollect">) {
  const tierFillIndex = getRebateTierFillIndex(gameRebatePercent);
  const progressPct =
    `${(tierFillIndex / (REBATE_TIERS.length - 1)) * 100}%` as DimensionValue;
  const historicalMax = Math.max(data.historicalMax, gameRebatePercent);

  return (
    <>
      <Text style={styles.dateRange}>{getInvitePeriodLabel()}</Text>
      <Text style={styles.currentRebate}>
        Current Rebate:{" "}
        <Text style={styles.rebateHighlight}>
          {summaryLoading ? "—" : formatGameRebatePercent(gameRebatePercent)}
        </Text>{" "}
        (Historical Max{" "}
        {summaryLoading ? "—" : formatGameRebatePercent(historicalMax)})
      </Text>

      <View style={styles.tierProgressRow}>
        {REBATE_TIERS.map((t, i) => (
          <View key={t.pct} style={styles.tierProgressItem}>
            <Text
              style={[
                styles.tierPct,
                i <= tierFillIndex && styles.tierPctActive,
              ]}
            >
              {t.pct}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.progressTrackWrap}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: progressPct }]} />
          {REBATE_TIERS.map((t, i) => (
            <View
              key={t.pct}
              style={[
                styles.progressDot,
                {
                  left: `${(i / (REBATE_TIERS.length - 1)) * 100}%` as DimensionValue,
                },
                i <= tierFillIndex && styles.progressDotFilled,
                i === tierFillIndex && styles.progressDotCurrent,
              ]}
            />
          ))}
        </View>
      </View>

      <View style={styles.tierAmountRow}>
        {REBATE_TIERS.map((t) => (
          <View key={t.pct} style={styles.tierAmountItem}>
            <Image
              source={BEAN_IMAGE}
              style={styles.tierCoinIcon}
              contentFit="contain"
            />
            <Text style={styles.tierAmount}>{t.amount}</Text>
          </View>
        ))}
      </View>

      <View style={styles.betsInfoCard}>
        <View style={styles.betsInfoRow}>
          <Ionicons
            name="pie-chart"
            size={18}
            color={INVITE.progressRed}
            style={styles.betsInfoIcon}
          />
          <View style={styles.betsInfoContent}>
            <View style={styles.betsInfoLine}>
              <Text style={styles.betsInfoText}>
                Valid bets in the Past 30 days:
              </Text>
              <Image
                source={BEAN_IMAGE}
                style={styles.betsCoinIcon}
                contentFit="contain"
              />
              <Text style={styles.betsInfoValue}>
                {summaryLoading ? "—" : formatNumber(data.validBets30d)}
              </Text>
            </View>
            <View style={styles.betsInfoLine}>
              <Text style={styles.betsInfoText}>Need</Text>
              <Image
                source={BEAN_IMAGE}
                style={styles.betsCoinIcon}
                contentFit="contain"
              />
              <Text style={styles.betsInfoText}>
                <Text style={styles.betsInfoValue}>
                  {summaryLoading ? "—" : formatNumber(data.needToProgress)}
                </Text>
                {" "}
                to progress to the next level
              </Text>
            </View>
          </View>
        </View>
      </View>
    </>
  );
}

function RealtimeCommissionCard({
  data,
  summaryLoading,
  onCollect,
  formatNumber,
}: Pick<
  BonusTabPanelProps,
  "data" | "summaryLoading" | "onCollect" | "formatNumber"
>) {
  return (
    <View style={styles.commissionCardWrap}>
      <View style={styles.commissionCard}>
        <View style={styles.treasureIconSlot}>
          <Image
            source={TREASURE_IMAGE}
            style={styles.treasureImage}
            contentFit="contain"
          />
        </View>
        <View style={styles.commissionTextBlock}>
          <View style={styles.commissionTitleRow}>
            <View style={styles.realtimeBadge}>
              <Text style={styles.realtimeBadgeText}>Real-Time</Text>
            </View>
            <Text style={styles.commissionTitle}>Income Commission</Text>
          </View>
          <View style={styles.commissionValueRow}>
            <Image
              source={BEAN_IMAGE}
              style={styles.coinIcon}
              contentFit="contain"
            />
            <Text style={styles.commissionValue}>
              {summaryLoading ? "—" : formatNumber(data.realtimeCommission)}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.collectBtnPill}
          onPress={onCollect}
          activeOpacity={0.85}
        >
          <Text style={styles.collectBtnText}>Collect</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Bonus card body (single scroll — not tabbed) ─────────────────────────────

function InviteBonusCardContent({
  onCollect: _onCollect,
  ...panelProps
}: BonusTabPanelProps) {
  return <GameRebatePanel {...panelProps} />;
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  headerBar: {
    backgroundColor: "#FFFFFF",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  headerTitle: {
    fontFamily: POPPINS,
    fontSize: 20,
    fontWeight: "600",
    color: "#000000",
  },
  headerSpacer: {
    width: 24,
  },

  heroBlock: {
    position: "relative",
    marginBottom: Spacing.sm,
  },
  bannerCard: {
    marginTop: Spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerImage: {
    alignSelf: "center",
  },
  rulesPillWrap: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.lg + 4,
    zIndex: 3,
  },
  rulesPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  rulesPillText: {
    fontFamily: POPPINS,
    fontSize: 12,
    fontWeight: "400",
    color: "#FFFFFF",
  },
  bannerSubtitleBelow: {
    fontFamily: POPPINS,
    fontSize: 22,
    fontWeight: "800",
    color: "#000000",
    textAlign: "center",
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },

  shareholderOuterCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    borderRadius: 15,
    padding: Spacing.md,
    alignItems: "center",
  },
  shareholderGlassCard: {
    marginTop: Spacing.md,
    width: "100%",
    borderRadius: 20,
    overflow: "hidden",
  },
  shareholderBonusCard: {
    width: "100%",
    aspectRatio: 373 / 120,
    position: "relative",
  },
  shareholderBonusBg: {
    ...StyleSheet.absoluteFillObject,
  },
  bonusNumberBlock: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 38,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  shareholderFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 38,
    justifyContent: "center",
    zIndex: 2,
  },
  tickerTextOnGlass: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textInverse,
  },
  tickerDividerOnGlass: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textInverse,
  },
  tickerCoinRing: {
    borderWidth: 2,
    borderColor: "#E53935",
    borderRadius: Radius.full,
    padding: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  tickerRankPillGlass: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: 20,
  },
  tickerRankTextGlass: {
    fontFamily: POPPINS,
    fontSize: 12,
    fontWeight: "400",
    color: INVITE.rankRed,
  },

  peachCardTitle: {
    fontFamily: POPPINS,
    fontSize: 22,
    fontWeight: "700",
    color: "#000000",
    textAlign: "center",
  },
  peachCardSub: {
    fontFamily: POPPINS,
    fontSize: 12,
    fontWeight: "400",
    color: "#000000",
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  bonusNumber: {
    fontFamily: POPPINS,
    fontSize: 36,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
    zIndex: 1,
  },
  tickerScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  tickerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tickerCoin: {
    width: 14,
    height: 14,
  },
  tickerHeart: {
    marginLeft: 2,
  },
  tickerAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.borderLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.5)",
  },

  rebateCardWrapper: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    borderRadius: 15,
    backgroundColor: INVITE.cardGlass,
    padding: Spacing.md,
  },
  rebateCardBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rebateCopy: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  rebateTitle: {
    fontFamily: POPPINS,
    fontSize: 16,
    fontWeight: "700",
    color: "#000000",
  },
  rebateSubLine: {
    fontFamily: POPPINS,
    fontSize: 14,
    fontWeight: "400",
    color: "#000000",
    lineHeight: 21,
  },
  rebateHierarchy: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.xs,
  },
  rebateTiersImage: {
    width: 68,
    height: 68,
  },
  rebateStarWrap: {
    width: 28,
    height: 26,
    marginTop: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  rebateStarImage: {
    ...StyleSheet.absoluteFillObject,
  },
  rebateStarPct: {
    fontFamily: POPPINS,
    fontSize: 8,
    fontWeight: "600",
    color: INVITE.starPctRed,
    textAlign: "center",
    zIndex: 1,
  },

  inviteBtn: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    backgroundColor: INVITE.ctaRed,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteBtnText: {
    fontFamily: POPPINS,
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  mainCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    backgroundColor: INVITE.cardGlass,
    borderRadius: 15,
    padding: Spacing.md,
  },
  mainCardInner: {
    marginTop: Spacing.md,
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    padding: Spacing.md,
  },
  bonusCornerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    width: "100%",
    paddingHorizontal: Spacing.xs,
  },
  bonusCornerLabel: {
    fontFamily: POPPINS,
    fontSize: 20,
    fontWeight: "700",
    color: "#000000",
    flexShrink: 1,
  },
  bonusCornerLabelRight: {
    textAlign: "right",
  },

  dateRange: {
    fontFamily: POPPINS,
    fontSize: 12,
    fontWeight: "600",
    color: "#000000",
    marginBottom: Spacing.xs,
  },
  currentRebate: {
    fontFamily: POPPINS,
    fontSize: 12,
    fontWeight: "600",
    color: "#000000",
    marginBottom: Spacing.lg,
  },
  rebateHighlight: {
    color: INVITE.gameRewardRed,
    fontWeight: "600",
  },

  tierProgressRow: {
    flexDirection: "row",
    marginBottom: Spacing.sm,
  },
  tierProgressItem: {
    flex: 1,
    alignItems: "center",
  },
  tierPct: {
    fontFamily: POPPINS,
    fontSize: 14,
    fontWeight: "400",
    color: "#0088FF",
    opacity: 0.35,
  },
  tierPctActive: {
    opacity: 1,
    fontWeight: "400",
  },
  progressTrackWrap: {
    paddingHorizontal: 0,
  },
  progressBar: {
    height: 8,
    backgroundColor: INVITE.progressTrack,
    borderRadius: 4,
    position: "relative",
  },
  progressFill: {
    height: 8,
    backgroundColor: INVITE.progressRed,
    borderRadius: 4,
  },
  progressDot: {
    position: "absolute",
    top: -3,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: INVITE.progressTrack,
    borderWidth: 1,
    borderColor: INVITE.progressTrack,
    marginLeft: -6,
  },
  progressDotFilled: {
    backgroundColor: INVITE.progressTrack,
    borderColor: INVITE.progressTrack,
  },
  progressDotCurrent: {
    borderColor: INVITE.progressRed,
    borderWidth: 1,
  },
  tierAmountRow: {
    flexDirection: "row",
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  tierAmountItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  tierCoinIcon: {
    width: 20,
    height: 14,
  },
  tierAmount: {
    fontFamily: "Inter",
    fontSize: 12,
    color: "#000000",
    textAlign: "center",
  },
  betsCoinIcon: {
    width: 16,
    height: 16,
  },

  betsInfoCard: {
    backgroundColor: INVITE.betsInfoBg,
    borderRadius: 10,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  betsInfoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  betsInfoIcon: {
    marginTop: 2,
  },
  betsInfoContent: {
    flex: 1,
    gap: Spacing.xs,
  },
  betsInfoLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 4,
    rowGap: 4,
  },
  betsInfoText: {
    fontFamily: POPPINS,
    fontSize: 14,
    fontWeight: "400",
    color: "#000000",
    flexShrink: 1,
  },
  betsInfoValue: {
    fontFamily: POPPINS,
    fontSize: 14,
    fontWeight: "600",
    color: "#000000",
  },

  commissionCardWrap: {
    marginTop: Spacing.md,
    alignSelf: "stretch",
    overflow: "visible",
  },
  commissionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
    backgroundColor: INVITE.commissionBg,
    borderRadius: 15,
    paddingVertical: Spacing.md,
    paddingRight: Spacing.md,
    paddingLeft: Spacing.sm,
    minHeight: 72,
    overflow: "visible",
  },
  treasureIconSlot: {
    width: 64,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  treasureImage: {
    width: 64,
    height: 60,
  },
  commissionTextBlock: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  commissionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  realtimeBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.75)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  realtimeBadgeText: {
    fontFamily: POPPINS,
    fontSize: 10,
    fontWeight: "600",
    color: INVITE.commissionMagenta,
  },
  commissionTitle: {
    fontFamily: POPPINS,
    fontSize: 14,
    fontWeight: "700",
    color: INVITE.commissionMagenta,
  },
  commissionValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  coinIcon: {
    width: 16,
    height: 16,
  },
  commissionValue: {
    fontFamily: POPPINS,
    fontSize: 14,
    fontWeight: "600",
    color: "#000000",
  },
  collectBtnPill: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    flexShrink: 0,
  },
  collectBtnText: {
    fontFamily: POPPINS,
    fontSize: 12,
    fontWeight: "600",
    color: INVITE.commissionMagenta,
  },

  rewardSection: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    backgroundColor: INVITE.cardGlassLight,
    borderRadius: 15,
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  rewardInnerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: Spacing.md,
    gap: Spacing.lg,
  },
  rewardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rewardTitle: {
    fontFamily: "Inter",
    fontSize: 20,
    fontWeight: "700",
    color: "#000000",
  },
  detailsLink: {
    fontFamily: POPPINS,
    fontSize: 14,
    fontWeight: "600",
    color: INVITE.accentPurple,
  },
  rewardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rewardLabel: {
    fontFamily: POPPINS,
    fontSize: 14,
    fontWeight: "400",
    color: "#000000",
  },
  rewardLabelStrong: {
    fontFamily: POPPINS,
    fontSize: 16,
    fontWeight: "700",
    color: "#000000",
  },
  rewardValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  rewardValue: {
    fontFamily: POPPINS,
    fontSize: 14,
    fontWeight: "600",
    color: "#000000",
  },

  myInvitationRow: {
    alignItems: "center",
    paddingTop: Spacing.xs,
  },
  myInvitationText: {
    fontFamily: POPPINS,
    fontSize: 14,
    fontWeight: "400",
    color: "#000000",
  },
});
