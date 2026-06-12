import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { giftsApi, type RoomLuckyHistoryItem } from '@api/gifts';
import { formatApiError } from '@api/client';
import { UserAvatar } from '@components/UserAvatar';
import { RankingSkeleton } from '@components/Skeleton';
import { RICH } from '@screens/level/LevelScreen';
import { Colors, Radius, Spacing } from '@/theme';
import type { LeaderboardUserEntry } from '@/types';

type OverlayTab = 'rank' | 'history';

const MEDAL_GOLD = '#FFD700';
const MEDAL_SILVER = '#C0C0C0';
const MEDAL_BRONZE = '#CD7F32';

const GRADIENT_COLORS = ['#1A1530', '#1C2A6E', '#13249A'] as const;

interface Props {
  visible: boolean;
  roomId: string;
  onClose: () => void;
}

function medalColor(rank: 1 | 2 | 3): string {
  if (rank === 1) return MEDAL_GOLD;
  if (rank === 2) return MEDAL_SILVER;
  return MEDAL_BRONZE;
}

function podiumHeight(rank: 1 | 2 | 3): number {
  if (rank === 1) return 132;
  if (rank === 2) return 112;
  return 96;
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

function PodiumSlot({
  entry,
  rank,
}: {
  entry: LeaderboardUserEntry | undefined;
  rank: 1 | 2 | 3;
}) {
  const border = medalColor(rank);
  const avatarSize = rank === 1 ? 58 : 48;

  return (
    <View style={styles.podiumCol}>
      <View style={[styles.podiumCard, { minHeight: podiumHeight(rank) }]}>
        {entry ? (
          <>
            <View style={styles.podiumAvatarWrap}>
              <Ionicons
                name="ribbon"
                size={rank === 1 ? 16 : 14}
                color={border}
                style={styles.crownIcon}
              />
              <View style={[styles.podiumAvatarRing, { borderColor: border, width: avatarSize + 6, height: avatarSize + 6, borderRadius: (avatarSize + 6) / 2 }]}>
                <UserAvatar
                  user={{
                    displayName: entry.displayName,
                    avatar: entry.avatar,
                    equippedFrame: entry.equippedFrame ?? null,
                  }}
                  size={avatarSize}
                  hideFrame
                  hideBorder
                />
              </View>
              <View style={[styles.rankBadge, { backgroundColor: border }]}>
                <Text style={styles.rankBadgeText}>{rank}</Text>
              </View>
            </View>
            <Text style={styles.podiumName} numberOfLines={1}>{entry.displayName}</Text>
            <RichLevelPill level={entry.richLevel ?? 0} />
            <WinAmount coins={entry.score} compact />
          </>
        ) : (
          <Text style={styles.podiumEmpty}>—</Text>
        )}
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

function HistoryRow({ item }: { item: RoomLuckyHistoryItem }) {
  return (
    <View style={styles.listRow}>
      <UserAvatar
        user={{
          displayName: item.user.displayName,
          avatar: item.user.avatar,
          equippedFrame: item.user.equippedFrame ?? null,
        }}
        size={40}
        hideFrame
        hideBorder
      />
      <View style={styles.listMain}>
        <View style={styles.nameRow}>
          <Text style={styles.listName} numberOfLines={1}>{item.user.displayName}</Text>
          <RichLevelPill level={item.user.richLevel ?? 0} />
        </View>
        <Text style={styles.historyGift} numberOfLines={1}>{item.gift.name}</Text>
      </View>
      <WinAmount coins={item.rewardCoins} />
    </View>
  );
}

export function LuckyGiftRankingOverlay({ visible, roomId, onClose }: Props) {
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

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdropTap} onPress={onClose} accessibilityLabel="Close ranking" />
      <LinearGradient colors={[...GRADIENT_COLORS]} style={styles.sheet}>
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
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#FFD700" />
              }
            />
          )
        ) : history.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>{emptyMessage}</Text>
          </View>
        ) : (
          <FlatList
            data={history}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <HistoryRow item={item} />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#FFD700" />
            }
          />
        )}
      </LinearGradient>
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
    top: '18%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
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
    color: 'rgba(255,255,255,0.55)',
    fontSize: 15,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  tabUnderline: {
    marginTop: 6,
    width: 28,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#FFFFFF',
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
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
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
  podiumCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
    paddingTop: Spacing.md,
    gap: 4,
  },
  podiumAvatarWrap: {
    alignItems: 'center',
    marginBottom: 2,
  },
  crownIcon: {
    position: 'absolute',
    top: -10,
    right: 4,
    zIndex: 2,
  },
  podiumAvatarRing: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    color: '#1A1530',
    fontSize: 10,
    fontWeight: '800',
  },
  podiumName: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    maxWidth: '100%',
  },
  podiumEmpty: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 18,
    marginTop: Spacing.xl,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  listRank: {
    width: 22,
    color: 'rgba(255,255,255,0.75)',
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
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  historyGift: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    marginTop: 2,
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
    color: 'rgba(255,255,255,0.7)',
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
