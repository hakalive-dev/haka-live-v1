import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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

import { invitesApi } from "@api/invites";
import { UserAvatar } from "@components/UserAvatar";
import { Spacing, Radius } from "@/theme";
import type { InvitationRankEntry } from "@/types";
import type { RootStackParamList } from "@navigation/types";

const BEAN_IMAGE = require("../../../assets/bean.png");

type Nav = NativeStackNavigationProp<RootStackParamList>;

const INVITE_SCREEN_BG = ["#FE6ADE", "#FCCCE1"] as [string, string];

const DETAILS = {
  panelFill: "rgba(255, 255, 255, 0.05)",
  panelBorder: "rgba(255, 255, 255, 0.25)",
  accentMagenta: "#CF11CF",
  cardMagenta: "#E91E8C",
  ribbonGold: ["#FFE566", "#F5C842"] as [string, string],
  ribbonText: "#1A1A1A",
  bonusYellow: "#FACB1B",
  starDecor: "rgba(255, 255, 255, 0.35)",
} as const;

const POPPINS = "Poppins";

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function DecorativeStars() {
  const stars = [
    { top: "8%", left: "-6%", size: 72, rotate: "-18deg" },
    { top: "22%", right: "-8%", size: 56, rotate: "12deg" },
    { top: "48%", left: "2%", size: 40, rotate: "8deg" },
    { top: "62%", right: "4%", size: 64, rotate: "-10deg" },
  ] as const;

  return (
    <>
      {stars.map((s, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={[
            styles.decorStar,
            {
              top: s.top,
              left: "left" in s ? s.left : undefined,
              right: "right" in s ? s.right : undefined,
              width: s.size,
              height: s.size,
              transform: [{ rotate: s.rotate }],
            },
          ]}
        >
          <Ionicons name="star" size={s.size} color={DETAILS.starDecor} />
        </View>
      ))}
    </>
  );
}

function RankCard({
  entry,
  cardWidth,
}: {
  entry: InvitationRankEntry;
  cardWidth: number;
}) {
  const bonus = entry.shareholder_bonus ?? 0;
  const isTop = entry.rank === 1;

  return (
    <View
      style={[
        styles.rankCard,
        { width: cardWidth },
        isTop && styles.rankCardTop,
      ]}
    >
      <LinearGradient
        colors={DETAILS.ribbonGold}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.rankRibbon}
      >
        <Text style={styles.rankRibbonText}>No. {entry.rank}</Text>
      </LinearGradient>

      <View style={styles.rankAvatarWrap}>
        <UserAvatar
          user={{ displayName: entry.displayName, avatar: entry.avatar }}
          size={44}
          hideFrame
        />
      </View>

      <Text style={styles.rankName} numberOfLines={1}>
        {entry.displayName || entry.username || "User"}
      </Text>
      <Text style={styles.rankPoints}>Points: {formatNumber(entry.score)}</Text>

      <View style={styles.rankBonusRow}>
        <Image source={BEAN_IMAGE} style={styles.rankBean} contentFit="contain" />
        <Text style={styles.rankBonusValue}>{formatNumber(bonus)}</Text>
      </View>
    </View>
  );
}

export function InviteRewardDetailsScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  const [rankList, setRankList] = useState<InvitationRankEntry[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [shareholderBonusPool, setShareholderBonusPool] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invitesApi.getShareholderRewards(1, 50);
      setRankList(data.items);
      setTotalPoints(data.totalPoints);
      setShareholderBonusPool(data.shareholderBonusPool);
    } catch (e) {
      console.warn("Invite reward details load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const horizontalPad = Spacing.lg;
  const gridGap = Spacing.sm;
  const cardWidth = useMemo(() => {
    const inner = screenWidth - horizontalPad * 2 - Spacing.md * 2;
    return Math.floor((inner - gridGap * 2) / 3);
  }, [screenWidth]);

  const renderItem = useCallback(
    ({ item }: { item: InvitationRankEntry }) => (
      <RankCard entry={item} cardWidth={cardWidth} />
    ),
    [cardWidth],
  );

  return (
    <LinearGradient
      colors={INVITE_SCREEN_BG}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.screen}
    >
      <DecorativeStars />

      <View style={[styles.safeTop, { paddingTop: insets.top + Spacing.sm }]}>
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <Text style={styles.headerPeriodMuted}>This week</Text>
            <TouchableOpacity
              hitSlop={8}
              onPress={() => navigation.goBack()}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={22} color="#1A1A1A" />
            </TouchableOpacity>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBlock}>
              <Text style={styles.statLabel}>Total Points</Text>
              <Text style={styles.statValue}>
                {loading ? "—" : formatNumber(totalPoints)}
              </Text>
            </View>
            <View style={[styles.statBlock, styles.statBlockRight]}>
              <Text style={styles.statLabel}>Shareholder Bonus</Text>
              <View style={styles.statBonusRow}>
                <Image
                  source={BEAN_IMAGE}
                  style={styles.statBean}
                  contentFit="contain"
                />
                <Text style={styles.statValue}>
                  {loading ? "—" : formatNumber(shareholderBonusPool)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.mainCard}>
          <Text style={styles.mainTitle}>{"{Haka Shareholder}"}</Text>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={DETAILS.accentMagenta} size="large" />
            </View>
          ) : rankList.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                No shareholders ranked this week yet.
              </Text>
            </View>
          ) : (
            <FlatList
              data={rankList}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              numColumns={3}
              scrollEnabled
              showsVerticalScrollIndicator={false}
              style={styles.mainCardList}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={[
                styles.gridContent,
                { paddingBottom: insets.bottom + Spacing.xl },
              ]}
            />
          )}
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeTop: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  decorStar: {
    position: "absolute",
    opacity: 0.9,
  },
  headerCard: {
    backgroundColor: DETAILS.panelFill,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: DETAILS.panelBorder,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  headerPeriodMuted: {
    fontFamily: POPPINS,
    fontSize: 13,
    color: "rgba(0,0,0,0.55)",
  },
  closeBtn: {
    padding: 2,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  statBlock: {
    flex: 1,
    alignItems: "flex-start",
  },
  statBlockRight: {
    alignItems: "flex-end",
  },
  statLabel: {
    fontFamily: POPPINS,
    fontSize: 12,
    color: "rgba(0,0,0,0.65)",
    marginBottom: 4,
  },
  statValue: {
    fontFamily: POPPINS,
    fontSize: 26,
    fontWeight: "700",
    color: "#1A1A1A",
    lineHeight: 30,
  },
  statBonusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statBean: {
    width: 22,
    height: 22,
  },
  mainCard: {
    flex: 1,
    backgroundColor: DETAILS.panelFill,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: DETAILS.panelBorder,
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  mainCardList: {
    flex: 1,
  },
  mainTitle: {
    fontFamily: POPPINS,
    fontSize: 18,
    fontWeight: "700",
    color: DETAILS.accentMagenta,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  gridContent: {
    paddingTop: Spacing.xs,
  },
  gridRow: {
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  rankCard: {
    backgroundColor: DETAILS.cardMagenta,
    borderRadius: Radius.md,
    alignItems: "center",
    paddingBottom: Spacing.sm,
    overflow: "hidden",
  },
  rankCardTop: {
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  rankRibbon: {
    width: "100%",
    paddingVertical: 3,
    alignItems: "center",
  },
  rankRibbonText: {
    fontFamily: POPPINS,
    fontSize: 10,
    fontWeight: "700",
    color: DETAILS.ribbonText,
  },
  rankAvatarWrap: {
    marginTop: Spacing.xs,
    marginBottom: 4,
  },
  rankName: {
    fontFamily: POPPINS,
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
    paddingHorizontal: 4,
    textAlign: "center",
  },
  rankPoints: {
    fontFamily: POPPINS,
    fontSize: 9,
    color: "rgba(255,255,255,0.9)",
    marginTop: 2,
    marginBottom: 4,
  },
  rankBonusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  rankBean: {
    width: 14,
    height: 14,
  },
  rankBonusValue: {
    fontFamily: POPPINS,
    fontSize: 11,
    fontWeight: "700",
    color: DETAILS.bonusYellow,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xxxl,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxxl,
  },
  emptyText: {
    fontFamily: POPPINS,
    fontSize: 14,
    color: "rgba(0,0,0,0.45)",
    textAlign: "center",
  },
});
