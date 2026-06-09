import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSelector } from "react-redux";
import * as Clipboard from "expo-clipboard";

import { invitesApi } from "@api/invites";
import { buildInviteShareMessage } from "../../invite/buildInviteShareMessage";
import type { RootState } from "../../store";
import { CopyableId } from "@components/CopyableId";
import { UserIdBadge } from "@components/UserIdBadge";
import { Colors, Spacing, Radius } from "@/theme";
import type {
  InvitationSummary,
  CreatorInvitation,
  InvitationReward,
  InvitationRankEntry,
} from "@/types";
import type { RootStackParamList } from "@navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type BottomTab = "bonus" | "details" | "rank";

const BANNER_IMAGE = require("../../../assets/invite_creator.png");
const COIN_BAG_IMG = require("../../../assets/coin_bag.png");
const BAG_IMAGE = require("../../../assets/bag_coins.png");
const COIN_IMAGE = require("../../../assets/bean.png");

function buildEarnDisplay(invitations: CreatorInvitation[]) {
  const envRaw = process.env.EXPO_PUBLIC_INVITE_CREATOR_MAX_REWARD_COINS;
  const envN = envRaw !== undefined && envRaw !== "" ? Number(envRaw) : NaN;
  let amount: number;
  if (Number.isFinite(envN) && envN > 0) {
    amount = Math.floor(envN);
  } else if (invitations.length > 0) {
    amount = Math.max(...invitations.map((i) => i.reward_coins));
    if (amount <= 0) amount = 8000;
  } else {
    amount = 8000;
  }

  if (amount >= 1_000_000 && amount % 1_000_000 === 0) {
    return { mid: String(amount / 1_000_000), suffix: "M" as const };
  }
  if (amount >= 1000) {
    const k = amount / 1000;
    const mid = Number.isInteger(k)
      ? String(k)
      : String(Math.round(k * 10) / 10).replace(/\.0$/, "");
    return { mid, suffix: "K" as const };
  }
  return { mid: String(amount), suffix: null };
}

export function InviteCreatorScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const myHakaId = useSelector((state: RootState) => state.auth.user?.hakaId);

  const [summary, setSummary] = useState<InvitationSummary | null>(null);
  const [bottomTab, setBottomTab] = useState<BottomTab>("bonus");
  const [invitations, setInvitations] = useState<CreatorInvitation[]>([]);
  const [rewards, setRewards] = useState<InvitationReward[]>([]);
  const [rankList, setRankList] = useState<InvitationRankEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [loading, setLoading] = useState(true);
  const [inviteSheetVisible, setInviteSheetVisible] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [sum, inv] = await Promise.all([
        invitesApi.getSummary(),
        invitesApi.getMyInvitations(),
      ]);
      setSummary(sum);
      setInvitations(inv);
    } catch (e) {
      console.warn("Invite summary error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTabData = useCallback(async () => {
    try {
      if (bottomTab === "bonus") {
        const data = await invitesApi.getMyInvitations();
        setInvitations(data);
      } else if (bottomTab === "details") {
        const data = await invitesApi.getRewards();
        setRewards(data);
      } else {
        const data = await invitesApi.getRank();
        setRankList(data);
      }
    } catch (e) {
      console.warn("Tab data error:", e);
    }
  }, [bottomTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);
  useEffect(() => {
    loadTabData();
  }, [loadTabData]);

  const earnDisplay = useMemo(
    () => buildEarnDisplay(invitations),
    [invitations],
  );

  const filteredInvitations = useMemo(() => {
    let rows = invitations;
    if (selectedMonth) {
      rows = rows.filter((r) => r.created_at.startsWith(selectedMonth));
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        const inv = r.invitee;
        const hay = [
          inv?.displayName,
          inv?.username,
          inv?.hakaId,
          r.invitee_hakaId,
          r.code,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return rows;
  }, [invitations, selectedMonth, searchQuery]);

  const handleCollect = useCallback(() => {
    Alert.alert(
      "Creator rewards",
      "Invite rewards are added to your wallet automatically when someone accepts your code. Your balance above is your current coin wallet.",
    );
  }, []);

  const handleShare = useCallback(async () => {
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
      /* cancelled */
    }
  }, [myHakaId]);

  const handleCopyLink = useCallback(async () => {
    if (!myHakaId) {
      Alert.alert(
        "Haka ID unavailable",
        "Complete your profile setup before copying your invite ID.",
      );
      return;
    }
    try {
      await Clipboard.setStringAsync(buildInviteShareMessage(myHakaId));
      Alert.alert("Copied", "Invite message copied to clipboard!");
    } catch (e: unknown) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "Could not copy invite ID",
      );
    }
  }, [myHakaId]);

  return (
    <LinearGradient colors={["#FFEFB1", "#FCF5BF"]} style={styles.screen}>
      {/* ── White header bar ── */}
      <View style={[styles.headerBar, { paddingTop: insets.top }]}>
        <View style={styles.headerContent}>
          <TouchableOpacity hitSlop={8} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color="rgba(0,0,0,0.7)" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Invite Creator</Text>
          <View style={styles.headerSpacer} />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      >
        {/* ── Hero section: text + image + golden card ── */}
        <View style={styles.heroSection}>
          {/* Banner text top-left */}
          <View style={styles.bannerArea}>
            <Text style={styles.bannerTitle}>Invite Creator</Text>
            <Text style={styles.bannerSubtitle}>
              The more invitations, the more rewards
            </Text>
          </View>

          {/* Character image — renders BEFORE golden container so it's behind it */}
          <View style={styles.bannerImageWrap}>
            {BANNER_IMAGE ? (
              <Image
                source={BANNER_IMAGE}
                style={styles.bannerImage}
                contentFit="contain"
              />
            ) : (
              <View style={styles.bannerImagePlaceholder}>
                <Ionicons
                  name="person"
                  size={60}
                  color="rgba(200,160,100,0.35)"
                />
              </View>
            )}
          </View>

          {/* Golden container — renders AFTER image = draws on top of it */}
          <View style={styles.goldenContainer}>
            {/* Pink-bordered earn card */}
            <View style={styles.earnCardOuter}>
              <View style={styles.earnCardInner}>
                <Text style={styles.earnLabel}>
                  Invite a Creator, Earn up to
                </Text>
                <View style={styles.earnRow}>
                  <View style={styles.earnBox}>
                    <Image
                      source={COIN_IMAGE}
                      style={styles.coinImg}
                      contentFit="contain"
                    />
                  </View>
                  <View style={styles.earnBox}>
                    <Text style={styles.earnDigitText}>{earnDisplay.mid}</Text>
                  </View>
                  {earnDisplay.suffix ? (
                    <View style={styles.earnBox}>
                      <Text style={styles.earnKText}>{earnDisplay.suffix}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            {/* Invite Friends button */}
            <TouchableOpacity
              style={styles.inviteButton}
              onPress={() => navigation.navigate("InviteFriends")}
              activeOpacity={0.85}
            >
              <Text style={styles.inviteButtonText}>Invite Friends</Text>
            </TouchableOpacity>

            {/* My Invitation */}
            <TouchableOpacity
              style={styles.myInvitationLink}
              onPress={() => setInviteSheetVisible(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.myInvitationText}>My Invitation {">"}</Text>
            </TouchableOpacity>
          </View>
          {/* end goldenContainer */}

          {/* Bag — absolute, straddling the golden container top edge, drawn on top */}
          <Image
            source={BAG_IMAGE}
            style={styles.bagImage}
            contentFit="contain"
          />
        </View>
        {/* end heroSection */}
        {/* ── Reward Details card ── */}
        <View style={styles.rewardCard}>
          {/* Reward Details inner with pink gradient bg */}
          <LinearGradient
            colors={["rgba(253,238,245,0.5)", "rgba(254,225,219,0.5)"]}
            style={styles.rewardInner}
          >
            <Text style={styles.rewardSectionTitle}>Reward Details</Text>

            {/* White sub-card for stats */}
            <View style={styles.rewardStatsCard}>
              <View style={styles.rewardTotalRow}>
                <Text style={styles.rewardTotalLabel}>
                  Total Creator Rewards
                </Text>
                <View style={styles.rewardTotalValueRow}>
                  <Image
                    source={COIN_IMAGE}
                    style={styles.coinSmall}
                    contentFit="contain"
                  />
                  <Text style={styles.rewardTotalValue}>
                    {summary?.total_rewards ?? 0}
                  </Text>
                </View>
              </View>

              <View style={styles.rewardStatsRow}>
                <View style={styles.rewardStat}>
                  <Text style={styles.rewardStatLabel}>
                    Current received rewards
                  </Text>
                  <View style={styles.rewardStatValueRow}>
                    <Image
                      source={COIN_IMAGE}
                      style={styles.coinTiny}
                      contentFit="contain"
                    />
                    <Text style={styles.rewardStatValue}>
                      {summary?.received_rewards ?? 0}
                    </Text>
                  </View>
                </View>
                <View style={styles.rewardStat}>
                  <Text style={styles.rewardStatLabel}>Rewards to unlock</Text>
                  <View style={styles.rewardStatValueRow}>
                    <Image
                      source={COIN_IMAGE}
                      style={styles.coinTiny}
                      contentFit="contain"
                    />
                    <Text style={styles.rewardStatValue}>
                      {summary?.rewards_to_unlock ?? 0}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </LinearGradient>

          {/* Wallet card */}
          <View style={styles.walletCard}>
            <View style={styles.walletLeft}>
              <Image
                source={COIN_BAG_IMG}
                style={styles.walletEmoji}
                contentFit="contain"
              />
              <View style={styles.walletTextCol}>
                <Text style={styles.walletTitle}>Creator Rewards Wallet</Text>
                <View style={styles.walletBalanceRow}>
                  <Image
                    source={COIN_IMAGE}
                    style={styles.coinTiny}
                    contentFit="contain"
                  />
                  <Text style={styles.walletBalance}>
                    {summary?.wallet_balance ?? 0}
                  </Text>
                </View>
                <Text style={styles.walletNote}>
                  Coins update when an invite is accepted; balance is your
                  wallet total
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.collectBtn} onPress={handleCollect}>
              <Text style={styles.collectBtnText}>Collect</Text>
            </TouchableOpacity>
          </View>

          {/* ── Bottom tabs ── */}
          <View style={styles.tabRow}>
            {(["bonus", "details", "rank"] as BottomTab[]).map((t) => (
              <TouchableOpacity key={t} onPress={() => setBottomTab(t)}>
                <Text
                  style={[
                    styles.tabText,
                    bottomTab === t && styles.tabTextActive,
                  ]}
                >
                  {t === "bonus"
                    ? "Invitation Bonus"
                    : t === "details"
                      ? "Details"
                      : "Rank"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Search + month filter ── */}
          <View style={styles.filterRow}>
            <View style={[styles.filterPill, styles.filterPillSearch]}>
              <Ionicons name="search" size={16} color="#1E1E1E" />
              <TextInput
                style={styles.filterSearchInput}
                placeholder="Search User ID"
                placeholderTextColor="rgba(0,0,0,0.35)"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={styles.filterPill}>
              <Ionicons name="calendar" size={14} color="#1E1E1E" />
              <Text style={styles.filterPillTextBold}>{selectedMonth}</Text>
              <Ionicons name="chevron-down" size={14} color="rgba(0,0,0,0.7)" />
            </View>
          </View>

          {/* ── Tab content ── */}
          {bottomTab === "bonus" && (
            <View style={styles.tabContent}>
              {loading ? null : invitations.length === 0 ? (
                <EmptyState />
              ) : filteredInvitations.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>
                    No invitations match your filters
                  </Text>
                </View>
              ) : (
                filteredInvitations.map((inv) => (
                  <View key={inv.id} style={styles.listItem}>
                    <View style={styles.listItemLeft}>
                      <Text style={styles.listItemName}>
                        {inv.invitee?.displayName ??
                          inv.invitee?.activeSpecialId ??
                          inv.invitee_hakaId ??
                          inv.code}
                      </Text>
                      <Text style={styles.listItemSub}>
                        {inv.status} •{" "}
                        {new Date(inv.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={styles.listItemCoins}>
                      🪙 {inv.reward_coins}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}

          {bottomTab === "details" && (
            <View style={styles.tabContent}>
              {rewards.length === 0 ? (
                <EmptyState />
              ) : (
                rewards.map((r) => (
                  <View key={r.id} style={styles.listItem}>
                    <View style={styles.listItemLeft}>
                      <Text style={styles.listItemName}>
                        {r.description || r.reward_type}
                      </Text>
                      <Text style={styles.listItemSub}>
                        {r.collected ? "Collected" : "Pending"} •{" "}
                        {new Date(r.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={styles.listItemCoins}>🪙 {r.coins}</Text>
                  </View>
                ))
              )}
            </View>
          )}

          {bottomTab === "rank" && (
            <View style={styles.tabContent}>
              {rankList.length === 0 ? (
                <EmptyState />
              ) : (
                rankList.map((entry) => (
                  <View key={entry.id} style={styles.listItem}>
                    <Text style={styles.rankNumber}>#{entry.rank}</Text>
                    <View style={styles.listItemLeft}>
                      <Text style={styles.listItemName}>
                        {entry.displayName}
                      </Text>
                      {entry.activeSpecialId && entry.activeSpecialIdLevel ? (
                        <UserIdBadge
                          hakaId={entry.hakaId ?? null}
                          activeSpecialId={entry.activeSpecialId}
                          activeSpecialIdLevel={entry.activeSpecialIdLevel}
                          width={86}
                          hidePlain
                        />
                      ) : (
                        <CopyableId
                          value={entry.activeSpecialId ?? entry.hakaId}
                          textStyle={styles.listItemSub}
                        />
                      )}
                    </View>
                    <Text style={styles.listItemCoins}>
                      {entry.score} invited
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Invite Bottom Sheet ── */}
      <Modal
        visible={inviteSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setInviteSheetVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setInviteSheetVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.sheetPanel}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Share your invite</Text>
            <Text style={styles.sheetHint}>
              Copy your personal link or share it — rewards apply when a friend
              signs up with your code.
            </Text>

            <Text style={styles.shareLabel}>Share to</Text>
            <View style={styles.shareRow}>
              <TouchableOpacity
                style={styles.shareItem}
                onPress={handleCopyLink}
              >
                <View
                  style={[styles.shareIcon, { backgroundColor: "#7B4FFF" }]}
                >
                  <Ionicons name="link" size={20} color="#FFFFFF" />
                </View>
                <Text style={styles.shareItemText}>Copy link</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareItem} onPress={handleShare}>
                <View
                  style={[styles.shareIcon, { backgroundColor: "#25D366" }]}
                >
                  <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
                </View>
                <Text style={styles.shareItemText}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareItem} onPress={handleShare}>
                <View
                  style={[styles.shareIcon, { backgroundColor: "#1877F2" }]}
                >
                  <Ionicons name="logo-facebook" size={20} color="#FFFFFF" />
                </View>
                <Text style={styles.shareItemText}>Facebook</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareItem} onPress={handleShare}>
                <View
                  style={[styles.shareIcon, { backgroundColor: "#FF6B6B" }]}
                >
                  <Ionicons name="image" size={20} color="#FFFFFF" />
                </View>
                <Text style={styles.shareItemText}>Image{"\n"}Sharing</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </LinearGradient>
  );
}

// ── Empty State ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyIcon}>📦</Text>
      <Text style={styles.emptyText}>No data</Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  // Header
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
    fontSize: 20,
    fontWeight: "600",
    color: "#000000",
  },
  headerSpacer: {
    width: 24,
  },

  // Hero section — relative wrapper for image + golden card layering
  heroSection: {
    position: "relative",
    marginBottom: 20,
  },

  // Banner text (top-left)
  bannerArea: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    marginBottom: 80,
  },
  bannerTextCol: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 34,
    fontWeight: "700",
    fontStyle: "italic",
    color: "#E04F5F",
    lineHeight: 42,
  },
  bannerSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#000000",
    marginTop: 2,
  },

  // Character image — absolute, right side, renders BEFORE golden container (behind it)
  bannerImageWrap: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 200,
    height: 210,
  },
  bannerImage: {
    width: 160,
    height: 210,
  },
  bannerImagePlaceholder: {
    width: 160,
    height: 210,
    alignItems: "center",
    justifyContent: "center",
  },

  // Golden container — renders AFTER image in JSX, so draws over it
  goldenContainer: {
    marginHorizontal: Spacing.xl,
    backgroundColor: "#FEDDA7",
    borderRadius: 16,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    alignItems: "center",
    marginTop: 0,
  },

  // Bag — absolute in heroSection, straddling the golden container top edge
  // bannerArea ~160px tall (with marginBottom:80), so golden container top ~160px
  bagImage: {
    position: "absolute",
    left: Spacing.xl + Spacing.sm,
    top: 110,
    width: 110,
    height: 110,
  },

  earnCardOuter: {
    width: "100%",
    marginBottom: Spacing.lg,
  },
  earnCardInner: {
    width: "100%",
    borderRadius: 12,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#F9467D",
  },
  earnLabel: {
    fontSize: 13,
    fontWeight: "400",
    color: "#333333",
    marginBottom: Spacing.md,
  },
  earnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  earnBox: {
    width: 54,
    height: 62,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#F9467D",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  coinImg: {
    width: 36,
    height: 36,
  },
  earnDigitText: {
    fontSize: 24,
    fontWeight: "600",
    color: "#F9467D",
  },
  earnKText: {
    fontSize: 24,
    fontWeight: "600",
    color: "#000000",
  },

  // Invite button
  inviteButton: {
    width: "100%",
    height: 50,
    backgroundColor: "#5F22D9",
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  inviteButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  // My Invitation (below golden container)
  myInvitationLink: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  myInvitationText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000000",
  },

  // Reward card (white container)
  rewardCard: {
    marginHorizontal: Spacing.xl,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: Spacing.md,
  },

  // Reward inner (pink gradient)
  rewardInner: {
    borderRadius: 15,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  rewardSectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000000",
    marginBottom: Spacing.md,
  },
  rewardStatsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    padding: Spacing.md,
  },
  rewardTotalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  rewardTotalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000000",
  },
  rewardTotalValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  coinSmall: {
    width: 18,
    height: 18,
  },
  rewardTotalValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000000",
  },
  rewardStatsRow: {
    flexDirection: "row",
    gap: Spacing.xxl,
  },
  rewardStat: {
    flex: 1,
  },
  rewardStatLabel: {
    fontSize: 12,
    fontWeight: "400",
    color: "#000000",
    marginBottom: Spacing.xs,
  },
  rewardStatValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  coinTiny: {
    width: 16,
    height: 16,
  },
  rewardStatValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000000",
  },

  // Wallet card
  walletCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFD7AB",
    borderRadius: 15,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.xl,
  },
  walletLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flex: 1,
  },
  walletEmoji: {
    width: 48,
    height: 48,
  },
  walletTextCol: {
    flex: 1,
  },
  walletTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#D1723A",
    letterSpacing: -0.3,
  },
  walletBalanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  walletBalance: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000000",
  },
  walletNote: {
    fontSize: 12,
    fontWeight: "400",
    color: "#D1723A",
  },
  collectBtn: {
    backgroundColor: "rgba(255,255,255,0.5)",
    borderRadius: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: 3,
  },
  collectBtnText: {
    fontSize: 12,
    fontWeight: "400",
    color: "#D1723A",
  },

  // Tabs
  tabRow: {
    flexDirection: "row",
    gap: 20,
    marginBottom: Spacing.md,
  },
  tabText: {
    fontSize: 16,
    fontWeight: "400",
    color: "#000000",
  },
  tabTextActive: {
    fontWeight: "600",
  },

  // Filter row
  filterRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: Spacing.md,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E0E0E0",
  },
  filterPillSearch: {
    flex: 1,
    minWidth: 0,
  },
  filterSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "400",
    color: "#000000",
    paddingVertical: 4,
  },
  filterPillText: {
    fontSize: 14,
    fontWeight: "400",
    color: "#000000",
  },
  filterPillTextBold: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000000",
  },

  // Tab content
  tabContent: {
    minHeight: 180,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F0F0F0",
    gap: Spacing.md,
  },
  listItemLeft: {
    flex: 1,
  },
  listItemName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333333",
  },
  listItemSub: {
    fontSize: 12,
    color: "#999999",
    marginTop: 2,
  },
  listItemCoins: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FF6B00",
  },
  rankNumber: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333333",
    width: 30,
  },

  // Empty
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
  },
  emptyIcon: {
    fontSize: 80,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "400",
    color: "#000000",
  },

  // Bottom sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
  },
  sheetPanel: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E0E0E0",
    alignSelf: "center",
    marginBottom: Spacing.lg,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#000000",
    marginBottom: Spacing.sm,
  },
  sheetHint: {
    fontSize: 13,
    lineHeight: 18,
    color: "#666666",
    marginBottom: Spacing.lg,
  },
  sheetSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  sheetSearchInput: {
    flex: 1,
    height: 44,
    fontSize: 14,
    color: "#000000",
  },
  shareLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333333",
    marginBottom: Spacing.md,
  },
  shareRow: {
    flexDirection: "row",
    gap: Spacing.xl,
  },
  shareItem: {
    alignItems: "center",
    gap: Spacing.sm,
  },
  shareIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  shareItemText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#333333",
    textAlign: "center",
  },
});
