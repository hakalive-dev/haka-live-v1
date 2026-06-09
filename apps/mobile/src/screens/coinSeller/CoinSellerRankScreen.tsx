import React, { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { coinSellerApi } from '@api/coinSeller';
import { Colors, Radius, Spacing } from '@/theme';
import { RankingSkeleton } from '@components/Skeleton';
import { UserAvatar } from '@components/UserAvatar';
import type { LeaderboardUserEntry } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'CoinSellerRank'>;

const TABS = ['This Month', 'Last Month'] as const;
type Tab = (typeof TABS)[number];

/** Screen background — Figma Frame 1000004955 */
const SCREEN_GRADIENT_TOP = '#F6DCAE';
const SCREEN_GRADIENT_BOTTOM = '#FFFFFF';
const SCREEN_GRADIENT_LOCATIONS: [number, number] = [0.0319, 0.9749];

/** Maps CSS linear-gradient angle (deg, 0 = up, clockwise) to expo-linear-gradient start/end. */
function gradientEndpointsFromCssAngle(angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    start: { x: 0.5 - Math.cos(rad) * 0.5, y: 0.5 - Math.sin(rad) * 0.5 },
    end: { x: 0.5 + Math.cos(rad) * 0.5, y: 0.5 + Math.sin(rad) * 0.5 },
  };
}

const COIN_SELLER_RANK_BG = gradientEndpointsFromCssAngle(183.03);
const TAB_TRACK_BEIGE = 'rgba(232, 215, 185, 0.85)';
const PAGINATION_MUTED = '#D9D9D9';
/** Coin amount emphasis — vibrant orange (design reference) */
const COIN_AMOUNT_ORANGE = '#FF8C00';
/** Level pill — hot pink (design reference) */
const LEVEL_BADGE_PINK = '#FF69B4';

/** Podium medal rings — aligned with RankingScreen Top3Section */
const MEDAL_GOLD = '#FFD700';
const MEDAL_SILVER = '#C0C0C0';
const MEDAL_BRONZE = '#CD7F32';

function medalRingColor(rank: 1 | 2 | 3): string {
  if (rank === 1) return MEDAL_GOLD;
  if (rank === 2) return MEDAL_SILVER;
  return MEDAL_BRONZE;
}

function formatSellerRankScore(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    if (m >= 100) return `${Math.round(m)}M`;
    const rounded = Math.round(m * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    if (k >= 100) return `${Math.round(k)}K`;
    const rounded = Math.round(k * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}K`;
  }
  return String(Math.round(n));
}

/** Min height for name + coin stack inside podium (below avatar overlap padding). */
function podiumBoxBodyHeight(rank: 1 | 2 | 3): number {
  if (rank === 1) return 100;
  if (rank === 2) return 86;
  return 72;
}

/** Tighter top corners on podium blocks (design ref — less rounded than Radius.lg). */
const PODIUM_BOX_RADIUS = Radius.sm;

/** Podium card fills — match SVG podium gradients (vertical top → bottom). */
function podiumBoxGradientColors(rank: 1 | 2 | 3): [string, string] {
  if (rank === 1) return ['#F8E5C4', '#FFFFFF'];
  if (rank === 2) return ['#E7F3FF', '#FFFFFF'];
  return ['#FED3C2', '#FFFFFF'];
}

type PodiumColumnProps = {
  entry: LeaderboardUserEntry | undefined;
  absoluteRank: 1 | 2 | 3;
  renderLevelBadge: (entry: LeaderboardUserEntry, compact?: boolean, podiumName?: boolean) => ReactNode;
};

function PodiumColumn({ entry, absoluteRank, renderLevelBadge }: PodiumColumnProps) {
  const bodyH = podiumBoxBodyHeight(absoluteRank);
  const avatarSize = absoluteRank === 1 ? 72 : 56;
  const ringBorder = 3;
  const outerSize = avatarSize + ringBorder * 2;
  /** Pull podium under avatar so ~half the ring overlaps the top of the box (classic podium). */
  const overlap = outerSize / 2;
  const ringColor = medalRingColor(absoluteRank);

  const badgeRow = (
    <View style={styles.podiumBadgeRow}>
      {absoluteRank === 1 ? (
        <View style={[styles.podiumRankBadge, styles.podiumRankBadgeGold]}>
          <Ionicons name="trophy" size={14} color={MEDAL_GOLD} />
        </View>
      ) : (
        <View style={styles.podiumRankBadge}>
          <Text style={styles.podiumRankBadgeText}>{absoluteRank}</Text>
        </View>
      )}
    </View>
  );

  const avatarBlock = entry ? (
    <View
      style={[
        styles.podiumAvatarRing,
        {
          width: outerSize,
          height: outerSize,
          borderRadius: outerSize / 2,
          borderColor: ringColor,
          marginBottom: -overlap,
          zIndex: 2,
          ...(Platform.OS === 'android' ? { elevation: 10 } : {}),
        },
      ]}
    >
      <UserAvatar
        user={{
          displayName: entry.displayName,
          avatar: entry.avatar,
          equippedFrame: entry.equippedFrame ?? null,
        }}
        size={avatarSize}
        hideBorder
      />
    </View>
  ) : (
    <View
      style={[
        styles.podiumAvatarPlaceholderRing,
        {
          width: outerSize,
          height: outerSize,
          borderRadius: outerSize / 2,
          marginBottom: -overlap,
          zIndex: 2,
          ...(Platform.OS === 'android' ? { elevation: 10 } : {}),
        },
      ]}
    >
      <Ionicons name="person" size={Math.round(avatarSize * 0.42)} color={Colors.textTertiary} />
    </View>
  );

  const gradColors = podiumBoxGradientColors(absoluteRank);

  const coinBox = (
    <View
      style={[
        styles.podiumCoinBox,
        !entry && styles.podiumCoinBoxEmpty,
        entry && { borderColor: ringColor },
        {
          zIndex: 1,
          minHeight: overlap + bodyH + Spacing.md,
        },
      ]}
    >
      <LinearGradient
        colors={gradColors}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.podiumCoinBoxGradient}
      />
      <View
        style={[
          styles.podiumCoinBoxInner,
          {
            paddingTop: overlap + Spacing.xs,
            paddingBottom: Spacing.sm,
          },
        ]}
      >
        {entry ? (
          <View style={[styles.podiumInsideBody, { minHeight: bodyH }]}>
            <View style={styles.podiumNameRow}>
              <Text style={styles.podiumUserName} numberOfLines={1}>
                {entry.displayName}
              </Text>
              {renderLevelBadge(entry, true, true)}
            </View>
            <View style={styles.podiumCoinOnlyRow}>
              <Image
                source={require('../../../assets/coin.png')}
                style={styles.podiumCoinIconLarge}
                contentFit="contain"
              />
              <Text
                style={[styles.podiumBarScore, absoluteRank === 1 && styles.podiumBarScoreFirst]}
              >
                {formatSellerRankScore(entry.score)}
              </Text>
            </View>
          </View>
        ) : (
          <View style={[styles.podiumPlaceholderFill, { paddingTop: overlap * 0.4 }]}>
            <Text style={styles.podiumBarEmpty}>—</Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.podiumColumn}>
      {badgeRow}
      <View style={styles.podiumStack}>
        {avatarBlock}
        {coinBox}
      </View>
    </View>
  );
}

export function CoinSellerRankScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('This Month');
  const [entries, setEntries] = useState<LeaderboardUserEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Leaderboard is served by GET /leaderboard/coin_sellers (live DB — see backend coinSellerService.getLeaderboard).
      // Tab UI reserved for when backend adds a prior-period filter; both requests use monthly window today.
      const window = tab === 'This Month' ? 'monthly' : 'monthly';
      const data = await coinSellerApi.getRank(window);
      setEntries(data);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);
  const rank1 = top3[0];
  const rank2 = top3[1];
  const rank3 = top3[2];

  const badgeLabel = (entry: LeaderboardUserEntry) =>
    entry.activeSpecialIdLevel ??
    (entry.richLevel != null ? `Lv.${entry.richLevel}` : null);

  /** Hot pink level pill — white label (design reference) */
  const renderLevelBadge = (entry: LeaderboardUserEntry, compact?: boolean, podiumName?: boolean) => {
    const label = badgeLabel(entry);
    if (!label) return null;
    return (
      <View
        style={[
          styles.levelBadge,
          compact && styles.levelBadgeCompact,
          podiumName && styles.levelBadgePodiumName,
        ]}
      >
        <Text style={styles.levelBadgeText} numberOfLines={1}>
          {label}
        </Text>
      </View>
    );
  };

  const renderListHeader = () => (
    <>
      <View style={styles.segmentWrap}>
        <View style={styles.segmentTrack} accessibilityRole="tablist">
          {TABS.map((t) => {
            const active = tab === t;
            return (
              <TouchableOpacity
                key={t}
                style={[styles.segmentBtn, active ? styles.segmentBtnActive : styles.segmentBtnIdle]}
                onPress={() => setTab(t)}
                activeOpacity={0.85}
              >
                <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{t}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {top3.length > 0 && (
        <View style={styles.podiumSection}>
          <View style={styles.podiumRow}>
            <View style={styles.podiumCol}>
              <PodiumColumn entry={rank2} absoluteRank={2} renderLevelBadge={renderLevelBadge} />
            </View>
            <View style={styles.podiumColCenter}>
              <PodiumColumn entry={rank1} absoluteRank={1} renderLevelBadge={renderLevelBadge} />
            </View>
            <View style={styles.podiumCol}>
              <PodiumColumn entry={rank3} absoluteRank={3} renderLevelBadge={renderLevelBadge} />
            </View>
          </View>
        </View>
      )}
    </>
  );

  const renderItem = ({ item }: { item: LeaderboardUserEntry }) => (
    <>
      {item.rank === 7 && (
        <View style={styles.paginationDecor}>
          <View style={styles.pagBar} />
          <View style={styles.pagEllipse} />
        </View>
      )}
      <View style={styles.listRow}>
        <Text style={styles.rankNum}>{item.rank}</Text>
        <UserAvatar
          user={{
            displayName: item.displayName,
            avatar: item.avatar,
            equippedFrame: item.equippedFrame ?? null,
          }}
          size={44}
        />
        <View style={styles.listNameBlock}>
          <Text style={styles.listName} numberOfLines={1}>
            {item.displayName}
          </Text>
          {renderLevelBadge(item, true)}
        </View>
        <View style={styles.listScoreWrap}>
          <Image
            source={require('../../../assets/coin.png')}
            style={styles.listCoinIcon}
            contentFit="contain"
          />
          <Text style={styles.listScore}>{formatSellerRankScore(item.score)}</Text>
        </View>
      </View>
    </>
  );

  return (
    <LinearGradient
      colors={[SCREEN_GRADIENT_TOP, SCREEN_GRADIENT_BOTTOM]}
      locations={SCREEN_GRADIENT_LOCATIONS}
      start={COIN_SELLER_RANK_BG.start}
      end={COIN_SELLER_RANK_BG.end}
      style={styles.screenGradient}
    >
      <View style={styles.screenInner}>
        <Image
          source={require('../../../assets/coin_seller_rank.png')}
          style={[styles.rankDecorArt, { top: insets.top + Spacing.xs }]}
          contentFit="contain"
          pointerEvents="none"
        />
        <View style={[styles.screenContent, { paddingTop: insets.top }]}>
          <View style={styles.headerWrap}>
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button">
                <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Coin Seller Rank</Text>
              <TouchableOpacity style={styles.giftCircle} hitSlop={12} accessibilityRole="button">
                <Ionicons name="gift" size={18} color={Colors.textInverse} />
              </TouchableOpacity>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <RankingSkeleton rows={8} />
            </View>
          ) : entries.length === 0 ? (
            <Text style={styles.emptyText}>No rankings yet.</Text>
          ) : (
            <FlatList
              data={rest}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              ListHeaderComponent={renderListHeader}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxl }}
            />
          )}
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screenGradient: {
    flex: 1,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    overflow: 'hidden',
  },
  screenInner: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  screenContent: {
    flex: 1,
  },

  /** Tall hero art — spans header + tabs region down toward podium (see design ref). */
  rankDecorArt: {
    position: 'absolute',
    left: Spacing.sm,
    width: 138,
    height: 208,
    zIndex: 0,
  },

  headerWrap: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    zIndex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  giftCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.live,
    alignItems: 'center',
    justifyContent: 'center',
  },

  segmentWrap: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  segmentTrack: {
    flexDirection: 'row',
    alignSelf: 'center',
    width: '72%',
    maxWidth: 268,
    minWidth: 220,
    backgroundColor: TAB_TRACK_BEIGE,
    borderRadius: Radius.full,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentBtnIdle: {
    backgroundColor: 'transparent',
  },
  segmentLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  segmentLabelActive: {
    fontWeight: '700',
  },

  podiumSection: {
    marginBottom: Spacing.lg,
  },
  podiumColumn: {
    width: '100%',
    alignItems: 'center',
  },
  podiumStack: {
    width: '100%',
    alignItems: 'center',
  },
  podiumNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    maxWidth: '100%',
  },
  podiumInsideBody: {
    flexGrow: 1,
    width: '100%',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  podiumPlaceholderFill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  podiumUserName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    textAlign: 'center',
    flexShrink: 1,
    maxWidth: '88%',
  },
  podiumCoinBox: {
    width: '100%',
    borderWidth: 2,
    borderRadius: PODIUM_BOX_RADIUS,
    overflow: 'hidden',
    paddingHorizontal: Spacing.sm,
    borderColor: MEDAL_BRONZE,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  podiumCoinBoxGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: PODIUM_BOX_RADIUS,
  },
  podiumCoinBoxEmpty: {
    borderStyle: 'dashed',
    borderColor: 'rgba(0,0,0,0.18)',
    elevation: 0,
    shadowOpacity: 0,
  },
  podiumCoinBoxInner: {
    justifyContent: 'flex-start',
    alignItems: 'center',
    width: '100%',
    zIndex: 1,
    flexGrow: 1,
  },
  podiumCoinOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  podiumCoinIconLarge: {
    width: 28,
    height: 28,
  },
  podiumBadgeRow: {
    height: 28,
    justifyContent: 'flex-end',
    marginBottom: Spacing.xs,
  },
  podiumRankBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumRankBadgeGold: {
    backgroundColor: 'rgba(255,215,0,0.22)',
  },
  podiumRankBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  podiumAvatarRing: {
    borderWidth: 3,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  podiumAvatarPlaceholderRing: {
    borderWidth: 3,
    borderColor: 'rgba(0,0,0,0.12)',
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  podiumBarEmpty: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  podiumRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  podiumCol: {
    flex: 1,
    maxWidth: 118,
    alignItems: 'stretch',
  },
  podiumColCenter: {
    flex: 1,
    maxWidth: 122,
    alignItems: 'stretch',
  },
  podiumBarScore: {
    fontSize: 17,
    fontWeight: '800',
    color: COIN_AMOUNT_ORANGE,
    textAlign: 'center',
  },
  podiumBarScoreFirst: {
    fontSize: 20,
  },
  levelBadge: {
    backgroundColor: LEVEL_BADGE_PINK,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    maxWidth: 72,
  },
  levelBadgeCompact: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    maxWidth: 64,
  },
  levelBadgePodiumName: {
    alignSelf: 'center',
    flexShrink: 0,
  },
  levelBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  paginationDecor: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingVertical: Spacing.md,
  },
  pagBar: {
    width: 18,
    height: 8,
    borderRadius: 2,
    backgroundColor: PAGINATION_MUTED,
  },
  pagEllipse: {
    width: 14,
    height: 11,
    borderRadius: 7,
    backgroundColor: PAGINATION_MUTED,
  },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    minHeight: 64,
  },
  rankNum: {
    width: 28,
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  listNameBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 4,
  },
  listName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  listScoreWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  listScore: {
    fontSize: 15,
    fontWeight: '700',
    color: COIN_AMOUNT_ORANGE,
  },
  listCoinIcon: {
    width: 18,
    height: 18,
  },

  loadingBox: {
    paddingVertical: Spacing.xl,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textTertiary,
    textAlign: 'center',
    paddingVertical: Spacing.xxl,
  },
});
