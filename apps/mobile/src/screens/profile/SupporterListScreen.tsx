import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { leaderboardApi } from '@api/leaderboard';
import type { FanEntry, LeaderboardWindow } from '@api/leaderboard';
import { Colors, Radius, Spacing } from '@/theme';
import { RankingSkeleton } from '@components/Skeleton';
import { UserAvatar } from '@components/UserAvatar';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'SupporterList'>;

const PERIOD_TABS: { key: LeaderboardWindow; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

const COIN_AMOUNT_ORANGE = Colors.coin;
const PODIUM_FRAME_SOURCES = {
  1: require('../../../assets/supporter_ranking/podium_frame_1.png'),
  2: require('../../../assets/supporter_ranking/podium_frame_2.png'),
  3: require('../../../assets/supporter_ranking/podium_frame_3.png'),
} as const;

/**
 * Frame layout — `innerDiameter` tuned to each PNG’s inner ring (@1x asset proportions).
 * Avatar is centered and sized to sit flush inside the gold/silver/bronze circle.
 */
const PODIUM_FRAME_LAYOUT: Record<1 | 2 | 3, { width: number; height: number; innerDiameter: number }> = {
  1: { width: 92, height: 96, innerDiameter: 64 },
  2: { width: 78, height: 78, innerDiameter: 52 },
  3: { width: 78, height: 78, innerDiameter: 52 },
};

function podiumFrameMetrics(rank: 1 | 2 | 3) {
  const { width, height, innerDiameter } = PODIUM_FRAME_LAYOUT[rank];
  return { width, height, innerDiameter };
}

function podiumBoxGradientColors(rank: 1 | 2 | 3): [string, string] {
  if (rank === 1) return ['#F8E5C4', '#FFFFFF'];
  if (rank === 2) return ['#E7F3FF', '#FFFFFF'];
  return ['#FED3C2', '#FFFFFF'];
}

/** Coins gifted — full amount (e.g. 25000), with decimals when needed (e.g. 199999.07). */
export function formatSupporterCoins(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function fanAvatarUser(entry: FanEntry) {
  const u = entry.user;
  return {
    displayName: u?.displayName ?? '—',
    avatar: u?.avatar ?? null,
    equippedFrame: null,
  };
}

type PodiumColumnProps = {
  entry: FanEntry | undefined;
  absoluteRank: 1 | 2 | 3;
  onPress?: () => void;
};

function PodiumFramedAvatar({
  entry,
  rank,
}: {
  entry: FanEntry | undefined;
  rank: 1 | 2 | 3;
}) {
  const { width, height, innerDiameter } = podiumFrameMetrics(rank);
  const user = entry?.user;
  const initial = (user?.displayName?.[0] ?? '?').toUpperCase();

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
        {user?.avatar ? (
          <Image
            source={{ uri: user.avatar }}
            style={{ width: innerDiameter, height: innerDiameter }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View
            style={[
              styles.podiumAvatarInnerPlaceholder,
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

function PodiumColumn({ entry, absoluteRank, onPress }: PodiumColumnProps) {
  const gradColors = podiumBoxGradientColors(absoluteRank);
  const isFirst = absoluteRank === 1;

  return (
    <TouchableOpacity
      style={[styles.podiumCard, isFirst ? styles.podiumCardFirst : styles.podiumCardSide]}
      onPress={onPress}
      disabled={!onPress || !entry?.user}
      activeOpacity={0.85}
    >
      <LinearGradient
        colors={gradColors}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.podiumCardGradient}
      />
      <View style={styles.podiumCardContent}>
        <View style={styles.podiumAvatarSlot}>
          <PodiumFramedAvatar entry={entry} rank={absoluteRank} />
        </View>
        {entry ? (
          <>
            <Text style={[styles.podiumUserName, isFirst && styles.podiumUserNameFirst]} numberOfLines={1}>
              {entry.user?.displayName ?? '—'}
            </Text>
            <View style={styles.podiumCoinOnlyRow}>
              <Image
                source={require('../../../assets/coin.png')}
                style={styles.podiumCoinIcon}
                contentFit="contain"
              />
              <Text style={[styles.podiumBarScore, isFirst && styles.podiumBarScoreFirst]}>
                {formatSupporterCoins(entry.coinsGifted)}
              </Text>
            </View>
          </>
        ) : (
          <Text style={styles.podiumBarEmpty}>—</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export function SupporterListScreen({ route, navigation }: Props) {
  const { userId } = route.params;
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<LeaderboardWindow>('monthly');
  const [fans, setFans] = useState<FanEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await leaderboardApi.getFans(userId, period);
      setFans(data);
    } catch {
      setFans([]);
    } finally {
      setLoading(false);
    }
  }, [userId, period]);

  useEffect(() => {
    load();
  }, [load]);

  const openSupporter = useCallback(
    (entry: FanEntry) => {
      const id = entry.user?.id;
      if (!id) return;
      navigation.navigate('PublicProfile', { userId: id });
    },
    [navigation],
  );

  const top3 = fans.slice(0, 3);
  const rest = fans.slice(3);
  const rank1 = top3[0];
  const rank2 = top3[1];
  const rank3 = top3[2];

  const periodTabs = (
    <View style={styles.periodTabBar}>
      <View style={styles.periodRow}>
      {PERIOD_TABS.map((p) => {
        const active = period === p.key;
        return (
          <TouchableOpacity
            key={p.key}
            style={styles.periodItem}
            onPress={() => setPeriod(p.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.periodText, active && styles.periodTextActive]}>
              {p.label}
            </Text>
            {active ? <View style={styles.periodUnderline} /> : null}
          </TouchableOpacity>
        );
      })}
      </View>
    </View>
  );

  const renderPodiumHeader = () =>
    top3.length > 0 ? (
      <View style={styles.podiumSection}>
        <View style={styles.podiumRow}>
          <View style={styles.podiumCol}>
            <PodiumColumn
              entry={rank2}
              absoluteRank={2}
              onPress={rank2 ? () => openSupporter(rank2) : undefined}
            />
          </View>
          <View style={styles.podiumColCenter}>
            <PodiumColumn
              entry={rank1}
              absoluteRank={1}
              onPress={rank1 ? () => openSupporter(rank1) : undefined}
            />
          </View>
          <View style={styles.podiumCol}>
            <PodiumColumn
              entry={rank3}
              absoluteRank={3}
              onPress={rank3 ? () => openSupporter(rank3) : undefined}
            />
          </View>
        </View>
      </View>
    ) : null;

  const renderItem = ({ item }: { item: FanEntry }) => (
    <TouchableOpacity
      style={styles.listRow}
      activeOpacity={0.7}
      onPress={() => openSupporter(item)}
      disabled={!item.user?.id}
    >
      <Text style={styles.rankNum}>{item.rank}</Text>
      <View style={styles.listUserMain}>
        <UserAvatar user={fanAvatarUser(item)} size={44} hideBorder />
        <Text style={styles.listName} numberOfLines={1}>
          {item.user?.displayName ?? '—'}
        </Text>
      </View>
      <View style={styles.listScoreWrap}>
        <Image
          source={require('../../../assets/coin.png')}
          style={styles.listCoinIcon}
          contentFit="contain"
        />
        <Text style={styles.listScore}>{formatSupporterCoins(item.coinsGifted)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} accessibilityRole="button">
          <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Supporter List</Text>
        <View style={styles.headerSpacer} />
      </View>

      {periodTabs}

      {loading ? (
        <View style={styles.loadingBox}>
          <RankingSkeleton rows={8} />
        </View>
      ) : fans.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>No supporters yet this {period}</Text>
        </View>
      ) : (
        <FlatList
          data={rest}
          keyExtractor={(item) => item.user?.id ?? String(item.rank)}
          renderItem={renderItem}
          ListHeaderComponent={renderPodiumHeader}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxl }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    minHeight: 44,
    marginBottom: Spacing.sm,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  headerSpacer: {
    width: 26,
  },
  periodTabBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  periodRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  periodItem: {
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    minWidth: 72,
  },
  periodText: {
    fontSize: 15,
    fontWeight: '400',
    color: Colors.textSecondary,
  },
  periodTextActive: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  periodUnderline: {
    marginTop: 6,
    width: 28,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.textPrimary,
  },
  loadingBox: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  podiumSection: {
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  podiumCol: {
    flex: 1,
    maxWidth: 110,
  },
  podiumColCenter: {
    flex: 1,
    maxWidth: 120,
  },
  podiumCard: {
    width: '100%',
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  podiumCardFirst: {
    minHeight: 168,
  },
  podiumCardSide: {
    minHeight: 148,
  },
  podiumCardGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.md,
  },
  podiumCardContent: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.xs,
    zIndex: 1,
  },
  podiumAvatarSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
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
  podiumAvatarInnerPlaceholder: {
    backgroundColor: Colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumAvatarInitial: {
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  podiumUserName: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
    textAlign: 'center',
    maxWidth: '100%',
    marginBottom: Spacing.xs,
  },
  podiumUserNameFirst: {
    fontSize: 13,
    fontWeight: '700',
  },
  podiumCoinOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  podiumCoinIcon: {
    width: 22,
    height: 22,
  },
  podiumBarScore: {
    fontSize: 13,
    fontWeight: '700',
    color: COIN_AMOUNT_ORANGE,
  },
  podiumBarScoreFirst: {
    fontSize: 14,
  },
  podiumBarEmpty: {
    fontSize: 14,
    color: Colors.textTertiary,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  rankNum: {
    width: 32,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  listUserMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginRight: Spacing.sm,
  },
  listName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  listScoreWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexShrink: 0,
  },
  listCoinIcon: {
    width: 20,
    height: 20,
  },
  listScore: {
    fontSize: 15,
    fontWeight: '700',
    color: COIN_AMOUNT_ORANGE,
    minWidth: 48,
    textAlign: 'right',
  },
});
