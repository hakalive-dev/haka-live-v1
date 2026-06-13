import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';

import { giftsApi, type RoomLuckyHistoryItem } from '@api/gifts';
import { formatApiError } from '@api/client';
import { UserAvatar } from '@components/UserAvatar';
import { RankingSkeleton } from '@components/Skeleton';
import { RICH } from '@screens/level/LevelScreen';
import { resolveDmGiftBubbleSource } from '@/utils/resolveGiftIconSource';
import { Colors, Radius, Spacing } from '@/theme';
import type { LeaderboardUserEntry } from '@/types';

const COIN_IMG = require('../../../assets/coin.png');
const BEAN_IMG = require('../../../assets/bean.png');

type OverlayTab = 'rank' | 'history';

/** Burgundy/navy top fading to near-black base. */
const OVERLAY_BASE = '#12121b';
const SHEET_GRADIENT = ['#2a1528', '#1a1a3a', OVERLAY_BASE] as const;

/** Frosted glass fill behind each podium seat. */
const PODIUM_GLASS_TOP = 'rgba(255, 255, 255, 0.10)';
const PODIUM_GLASS_MID = 'rgba(255, 255, 255, 0.05)';
const PODIUM_GLASS_BOTTOM = 'rgba(255, 255, 255, 0.02)';

/** Same podium rings as supporter ranking on PublicProfileScreen / SupporterListScreen. */
const PODIUM_FRAME_SOURCES = {
  1: require('../../../assets/supporter_ranking/podium_frame_1.png'),
  2: require('../../../assets/supporter_ranking/podium_frame_2.png'),
  3: require('../../../assets/supporter_ranking/podium_frame_3.png'),
} as const;

const PODIUM_FRAME_LAYOUT: Record<1 | 2 | 3, { width: number; height: number; innerDiameter: number }> = {
  1: { width: 92, height: 96, innerDiameter: 64 },
  2: { width: 78, height: 78, innerDiameter: 52 },
  3: { width: 78, height: 78, innerDiameter: 52 },
};

interface Props {
  visible: boolean;
  roomId: string;
  onClose: () => void;
}

/** Tiered glass pedestal height — avatar/ring sits above this block. */
function podiumGlassHeight(rank: 1 | 2 | 3): number {
  if (rank === 1) return 80;
  if (rank === 2) return 64;
  return 48;
}

function RichLevelPill({ level }: { level: number }) {
  if (level <= 0) return null;
  return (
    <View style={styles.levelBadge}>
      <Image
        source={RICH[Math.min(Math.max(level, 1), 100)] ?? RICH[1]}
        style={styles.levelIcon}
        contentFit="contain"
      />
    </View>
  );
}

function WinAmount({ coins, compact }: { coins: number; compact?: boolean }) {
  return (
    <View style={styles.winRow}>
      <Text style={[styles.winLabel, compact && styles.winLabelCompact]}>Win</Text>
      <Image source={require('../../../assets/coin.png')} style={styles.coinIcon} contentFit="contain" />
      <Text style={[styles.winAmount, compact && styles.winAmountCompact]} numberOfLines={1}>
        {coins.toLocaleString()}
      </Text>
    </View>
  );
}

function PodiumFramedAvatar({
  entry,
  rank,
}: {
  entry: LeaderboardUserEntry | undefined;
  rank: 1 | 2 | 3;
}) {
  const { width, height, innerDiameter } = PODIUM_FRAME_LAYOUT[rank];
  const initial = (entry?.displayName?.[0] ?? '?').toUpperCase();

  return (
    <View style={[styles.podiumAvatarFrameWrap, { width, height }]}>
      <View
        style={[
          styles.podiumAvatarClip,
          {
            width: innerDiameter,
            height: innerDiameter,
            borderRadius: innerDiameter / 2,
          },
        ]}
      >
        {entry?.avatar ? (
          <Image
            source={{ uri: entry.avatar }}
            style={{ width: innerDiameter, height: innerDiameter }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View
            style={[
              styles.podiumAvatarPlaceholder,
              { width: innerDiameter, height: innerDiameter, borderRadius: innerDiameter / 2 },
            ]}
          >
            <Text style={[styles.podiumAvatarInitial, { fontSize: innerDiameter * 0.38 }]}>
              {initial}
            </Text>
          </View>
        )}
      </View>
      <Image
        source={PODIUM_FRAME_SOURCES[rank]}
        style={styles.podiumFrameOverlay}
        contentFit="contain"
        pointerEvents="none"
      />
    </View>
  );
}

function PodiumSlot({
  entry,
  rank,
}: {
  entry: LeaderboardUserEntry | undefined;
  rank: 1 | 2 | 3;
}) {
  return (
    <View style={styles.podiumCol}>
      <View style={styles.podiumSlot}>
        <View style={styles.podiumAvatarWrap}>
          <PodiumFramedAvatar entry={entry} rank={rank} />
        </View>
        <LinearGradient
          colors={[PODIUM_GLASS_TOP, PODIUM_GLASS_MID, PODIUM_GLASS_BOTTOM]}
          locations={[0, 0.45, 1]}
          style={[styles.podiumGlass, { minHeight: podiumGlassHeight(rank) }]}
        >
          {entry ? (
            <>
              <Text style={styles.podiumName} numberOfLines={1}>{entry.displayName}</Text>
              <RichLevelPill level={entry.richLevel ?? 0} />
              <WinAmount coins={entry.score} compact />
            </>
          ) : (
            <Text style={styles.podiumEmpty}>—</Text>
          )}
        </LinearGradient>
      </View>
    </View>
  );
}

function PodiumSection({ entries }: { entries: LeaderboardUserEntry[] }) {
  const rank1 = entries[0];
  const rank2 = entries[1];
  const rank3 = entries[2];

  return (
    <View style={styles.podiumSection}>
      <View style={styles.podiumRow}>
        <PodiumSlot entry={rank2} rank={2} />
        <PodiumSlot entry={rank1} rank={1} />
        <PodiumSlot entry={rank3} rank={3} />
      </View>
    </View>
  );
}

function RankListRow({ entry }: { entry: LeaderboardUserEntry }) {
  return (
    <View style={styles.listRow}>
      <Text style={styles.listRank}>{entry.rank}</Text>
      <UserAvatar
        user={{
          displayName: entry.displayName,
          avatar: entry.avatar,
          equippedFrame: entry.equippedFrame ?? null,
        }}
        size={40}
        hideFrame
        hideBorder
      />
      <View style={styles.listMain}>
        <View style={styles.nameRow}>
          <Text style={styles.listName} numberOfLines={1}>{entry.displayName}</Text>
          <RichLevelPill level={entry.richLevel ?? 0} />
        </View>
      </View>
      <WinAmount coins={entry.score} />
    </View>
  );
}

function HistoryGiftThumb({ gift }: { gift: RoomLuckyHistoryItem['gift'] }) {
  const source = resolveDmGiftBubbleSource(gift.icon, gift.image);
  if (source.kind === 'bundled') {
    return <Image source={source.value} style={styles.historyGiftIcon} contentFit="contain" />;
  }
  if (source.kind === 'remote') {
    return <Image source={{ uri: source.value }} style={styles.historyGiftIcon} contentFit="contain" />;
  }
  if (source.kind === 'emoji') {
    return <Text style={styles.historyGiftEmoji}>{source.value}</Text>;
  }
  return <Text style={styles.historyGiftEmoji}>🎁</Text>;
}

function HistoryTableHeader() {
  return (
    <View style={styles.historyHeaderRow}>
      <Text style={[styles.historyHeaderCell, styles.historyColGift]}>Gift</Text>
      <Text style={[styles.historyHeaderCell, styles.historyColCost]}>Cost</Text>
      <Text style={[styles.historyHeaderCell, styles.historyColBeans]}>To him/her</Text>
      <Text style={[styles.historyHeaderCell, styles.historyColPrize]}>Prize</Text>
    </View>
  );
}

function HistoryTableRow({ item }: { item: RoomLuckyHistoryItem }) {
  const qty = (item.qty ?? 1) > 0 ? (item.qty ?? 1) : 1;
  return (
    <View style={styles.historyRow}>
      <View style={[styles.historyCell, styles.historyColGift]}>
        <HistoryGiftThumb gift={item.gift} />
        <Text style={styles.historyQtyText}>x{qty}</Text>
      </View>
      <View style={[styles.historyCell, styles.historyColCost]}>
        <Image source={COIN_IMG} style={styles.historyValueIcon} contentFit="contain" />
        <Text style={styles.historyValueText}>{item.coinCost.toLocaleString()}</Text>
      </View>
      <View style={[styles.historyCell, styles.historyColBeans]}>
        <Text style={styles.historyValueText}>{(item.receiverBeans ?? 0).toLocaleString()}</Text>
        <Image source={BEAN_IMG} style={styles.historyValueIcon} contentFit="contain" />
      </View>
      <View style={[styles.historyCell, styles.historyColPrize]}>
        <Text style={styles.historyValueText}>{item.rewardCoins.toLocaleString()}</Text>
        <Image source={COIN_IMG} style={styles.historyValueIcon} contentFit="contain" />
      </View>
    </View>
  );
}

const SHEET_HEIGHT_RATIO = 0.8;

export function LuckyGiftRankingOverlay({ visible, roomId, onClose }: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const [tab, setTab] = useState<OverlayTab>('rank');
  const [rankings, setRankings] = useState<LeaderboardUserEntry[]>([]);
  const [history, setHistory] = useState<RoomLuckyHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!visible || !roomId) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      if (tab === 'rank') {
        const data = await giftsApi.getRoomLuckyRankings(roomId);
        setRankings(data.items);
      } else {
        const data = await giftsApi.getRoomLuckyHistory(roomId);
        setHistory(data.items);
      }
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [roomId, tab, visible]);

  useEffect(() => {
    if (!visible) return;
    void load();
  }, [visible, tab, load]);

  useEffect(() => {
    if (!visible) {
      setTab('rank');
      setError(null);
    }
  }, [visible]);

  if (!visible) return null;

  const top3 = rankings.slice(0, 3);
  const restRankings = rankings.slice(3);
  const emptyMessage = 'No lucky wins in this room yet';
  const emptyHistoryMessage = 'No lucky gift history in this room yet';

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdropTap} onPress={onClose} accessibilityLabel="Close ranking" />
      <View style={[styles.sheet, { height: windowHeight * SHEET_HEIGHT_RATIO }]}>
        <LinearGradient colors={[...SHEET_GRADIENT]} style={styles.sheetBg} />
        <View style={styles.sheetContent}>
        <View style={styles.tabRow}>
          {(['rank', 'history'] as const).map((key) => {
            const active = tab === key;
            const label = key === 'rank' ? 'Rank' : 'History';
            return (
              <Pressable
                key={key}
                style={styles.tabItem}
                onPress={() => setTab(key)}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
                {active ? <View style={styles.tabUnderline} /> : null}
              </Pressable>
            );
          })}
        </View>

        {loading && (tab === 'rank' ? rankings.length === 0 : history.length === 0) ? (
          <View style={styles.loadingBox}>
            <RankingSkeleton rows={5} />
          </View>
        ) : error ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => void load()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : tab === 'rank' ? (
          rankings.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{emptyMessage}</Text>
            </View>
          ) : (
            <FlatList
              data={restRankings}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <RankListRow entry={item} />}
              ListHeaderComponent={top3.length > 0 ? <PodiumSection entries={top3} /> : null}
              style={styles.sheetBody}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#FFD700" />
              }
            />
          )
        ) : history.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>{emptyHistoryMessage}</Text>
          </View>
        ) : (
          <FlatList
            data={history}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <HistoryTableRow item={item} />}
            ListHeaderComponent={<HistoryTableHeader />}
            style={styles.sheetBody}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.historyListContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#FFD700" />
            }
          />
        )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  backdropTap: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    backgroundColor: OVERLAY_BASE,
  },
  sheetBg: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetContent: {
    flex: 1,
  },
  sheetBody: {
    flex: 1,
  },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xxl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  tabItem: {
    alignItems: 'center',
    minWidth: 72,
    paddingVertical: Spacing.xs,
  },
  tabText: {
    color: 'rgba(210, 200, 230, 0.55)',
    fontSize: 15,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#F2ECFF',
    fontWeight: '700',
  },
  tabUnderline: {
    marginTop: 6,
    width: 28,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#F2ECFF',
  },
  loadingBox: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyText: {
    color: 'rgba(210, 200, 230, 0.65)',
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  retryText: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.sm,
  },
  historyListContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  historyHeaderCell: {
    color: 'rgba(210, 200, 230, 0.55)',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(196, 186, 220, 0.12)',
  },
  historyCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  historyColGift: {
    flex: 1,
  },
  historyColCost: {
    flex: 1,
  },
  historyColBeans: {
    flex: 1,
  },
  historyColPrize: {
    flex: 1,
  },
  historyGiftIcon: {
    width: 28,
    height: 28,
  },
  historyGiftEmoji: {
    fontSize: 22,
    width: 28,
    textAlign: 'center',
  },
  historyQtyText: {
    color: '#F2ECFF',
    fontSize: 12,
    fontWeight: '600',
  },
  historyValueIcon: {
    width: 14,
    height: 14,
  },
  historyValueText: {
    color: '#F2ECFF',
    fontSize: 12,
    fontWeight: '600',
  },
  podiumSection: {
    marginBottom: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  podiumCol: {
    flex: 1,
    maxWidth: 118,
  },
  podiumSlot: {
    width: '100%',
    alignItems: 'center',
  },
  podiumAvatarWrap: {
    alignItems: 'center',
    zIndex: 1,
  },
  podiumGlass: {
    width: '100%',
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    gap: 4,
    overflow: 'hidden',
  },
  podiumAvatarFrameWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumAvatarClip: {
    overflow: 'hidden',
    backgroundColor: Colors.surfaceHighlight,
    zIndex: 0,
  },
  podiumFrameOverlay: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    zIndex: 1,
  },
  podiumAvatarPlaceholder: {
    backgroundColor: Colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumAvatarInitial: {
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  podiumName: {
    color: '#F2ECFF',
    fontSize: 12,
    fontWeight: '700',
    maxWidth: '100%',
  },
  podiumEmpty: {
    color: 'rgba(210, 200, 230, 0.4)',
    fontSize: 18,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  listRank: {
    width: 22,
    color: 'rgba(230, 222, 245, 0.8)',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  listMain: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  listName: {
    flexShrink: 1,
    color: '#F2ECFF',
    fontSize: 14,
    fontWeight: '600',
  },
  levelBadge: {
    width: 22,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelIcon: {
    width: 22,
    height: 14,
  },
  winRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    maxWidth: 120,
  },
  winLabel: {
    color: 'rgba(210, 200, 230, 0.72)',
    fontSize: 11,
    fontWeight: '500',
  },
  winLabelCompact: {
    fontSize: 10,
  },
  coinIcon: {
    width: 12,
    height: 12,
  },
  winAmount: {
    color: Colors.coin,
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  winAmountCompact: {
    fontSize: 10,
  },
});
