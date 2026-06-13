import React, { useCallback, useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { UserAvatar } from '@components/UserAvatar';
import { RICH, CHARM } from '@screens/level/LevelScreen';
import { leaderboardApi } from '@api/leaderboard';
import { queryKeys } from '@api/queryKeys';
import type { LeaderboardWindow, CreatorStats } from '@api/leaderboard';
import { Colors, Spacing, Radius } from '@/theme';
import { RankingSkeleton } from '@components/Skeleton';
import type { LeaderboardUserEntry } from '@/types';
import type { RootStackParamList, RootStackScreenProps } from '@navigation/types';
import { StateStarTab } from './StateStarTab';

type Props = RootStackScreenProps<'Ranking'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

// ── Types ────────────────────────────────────────────────────────────────────

type MainTab = 'state' | 'agent' | 'game' | 'creator';

// ── Config ───────────────────────────────────────────────────────────────────

const MAIN_TABS: { key: MainTab; label: string }[] = [
  { key: 'state',   label: 'State' },
  { key: 'agent',   label: 'Agent' },
  { key: 'game',    label: 'Game' },
  { key: 'creator', label: 'Activity' },
];

const PERIOD_TABS: { key: LeaderboardWindow; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

const GAME_EMPTY_MESSAGE = 'Games coming soon';
const CREATOR_EMPTY_MESSAGE = 'No rankings yet';
const AGENT_EMPTY_MESSAGE = 'No rankings yet';

const TAB_BG_COLORS: Record<MainTab, string> = {
  state:   '#1A0A28',
  agent:   '#000000',
  game:    '#47014A',
  creator: '#13249A',
};

const BANNER_GRADIENTS: Record<MainTab, [string, string, string]> = {
  state:   ['#1A0028', '#4A1F6B', '#9D7FFF'],
  agent:   ['#0D0028', '#4A0F6B', '#B03FF0'],
  game:    ['#001028', '#0F2E6B', '#3F7AF0'],
  creator: ['#280010', '#6B0F3A', '#F03F80'],
};

const BANNER_ICONS: Record<MainTab, keyof typeof Ionicons.glyphMap> = {
  state:   'location',
  agent:   'briefcase',
  game:    'trophy',
  creator: 'pulse',
};

const BANNER_IMAGES: Record<MainTab, ReturnType<typeof require>> = {
  state:   require('../../../assets/ranking/state.png'),
  agent:   require('../../../assets/ranking/agent.png'),
  game:    require('../../../assets/ranking/game.png'),
  creator: require('../../../assets/ranking/creator.png'),
};

// ── Component ────────────────────────────────────────────────────────────────

export function RankingScreen({ route }: Props) {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const initialTabParam = route.params?.initialTab;
  const initialTab: MainTab =
    initialTabParam === 'state' ||
    initialTabParam === 'game' ||
    initialTabParam === 'creator' ||
    initialTabParam === 'agent'
      ? initialTabParam
      : 'state';
  const [mainTab, setMainTab] = useState<MainTab>(initialTab);
  const [period, setPeriod] = useState<LeaderboardWindow>('daily');
  const [dayCountdown, setDayCountdown] = useState('');
  const [creatorStats, setCreatorStats] = useState<CreatorStats | null>(null);

  // Cached per (mainTab, period) so switching tabs/periods paints the last
  // result instantly and refreshes in the background; auto-refreshes every 60s.
  const rankingQuery = useQuery({
    queryKey: queryKeys.ranking.list({
      mainTab,
      period,
    }),
    queryFn: () => {
      if (mainTab === 'agent') return leaderboardApi.getAgentCoinsRank();
      return leaderboardApi.getByCategory('creator_hosts', period);
    },
    enabled: mainTab !== 'game' && mainTab !== 'state',
    staleTime: 60_000,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
  const data: LeaderboardUserEntry[] = mainTab === 'game' ? [] : (rankingQuery.data ?? []);
  const loading = mainTab !== 'game' && data.length === 0 && rankingQuery.isLoading;
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const tick = () => {
      const nowUtc = Date.now();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const nowIst = new Date(nowUtc + istOffset);
      const midnightIst = new Date(nowIst);
      midnightIst.setUTCHours(24, 0, 0, 0);
      const diffMs = midnightIst.getTime() - nowIst.getTime();
      const hh = Math.floor(diffMs / 3_600_000);
      const mm = Math.floor((diffMs % 3_600_000) / 60_000);
      const ss = Math.floor((diffMs % 60_000) / 1_000);
      setDayCountdown(
        `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
      );
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await rankingQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [rankingQuery]);

  const handleMainTabChange = useCallback((tab: MainTab) => {
    setMainTab(tab);
    setPeriod('daily');
  }, []);

  // Fetch creator stats whenever the creator tab is active
  useEffect(() => {
    if (mainTab !== 'creator') {
      setCreatorStats(null);
      return;
    }
    leaderboardApi.getCreatorStats(period)
      .then(setCreatorStats)
      .catch((e) => {
        console.warn('Creator stats error:', e);
        setCreatorStats(null);
      });
  }, [mainTab, period]);

  const creatorMyRank =
    mainTab === 'creator' && creatorStats != null
      ? { rank: creatorStats.earnerRank, score: creatorStats.earnerScore }
      : null;

  const topScore = data.length > 0 ? data[0].score : 0;
  const myDistance =
    creatorMyRank != null && topScore > 0 && creatorMyRank.score != null
      ? topScore - creatorMyRank.score
      : topScore;

  const emptyMessage =
    mainTab === 'game'
      ? GAME_EMPTY_MESSAGE
      : mainTab === 'creator'
        ? CREATOR_EMPTY_MESSAGE
        : AGENT_EMPTY_MESSAGE;

  if (mainTab === 'state') {
    return <StateStarTab navigation={navigation} onTabChange={handleMainTabChange} />;
  }

  return (
    <View style={[styles.screen, { backgroundColor: TAB_BG_COLORS[mainTab] }]}>
      {/* ── Banner (image covers header + banner together) ── */}
      <View style={[styles.banner, { paddingTop: insets.top }]}>
        {/* Full-width background image */}
        <Image
          source={BANNER_IMAGES[mainTab]}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
        {/* Dark gradient overlay for readability */}
        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.1)']}
          style={StyleSheet.absoluteFill}
        />

        {/* ── Header: main tabs + back ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.mainTabRow}>
            {MAIN_TABS.map((tab) => {
              const isActive = mainTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => handleMainTabChange(tab.key)}
                  style={[styles.mainTabItem, isActive && styles.mainTabItemActive]}
                >
                  <Text style={[styles.mainTabText, isActive && styles.mainTabTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Creator tab — reward level overlay */}
        {mainTab === 'creator' && creatorStats != null && (
          <View style={styles.creatorOverlay}>
            {/* Level + reward card */}
            <View style={styles.creatorCard}>
              <View style={styles.creatorCardInner}>
                <View style={styles.creatorLevelRow}>
                  <Text style={styles.creatorCardText}>Level: </Text>
                  {Array.from({ length: creatorStats.stars }).map((_, i) => (
                    <Image key={i} source={require('../../../assets/ranking/star.png')} style={styles.creatorStarImg} />
                  ))}
                </View>
                <View style={styles.creatorRewardRow}>
                  <Text style={styles.creatorCardText}>Reward: </Text>
                  <Image source={require('../../../assets/ranking/reward.png')} style={styles.creatorRewardImg} />
                  <Text style={styles.creatorCardText}> {creatorStats.earnerScore.toLocaleString()}</Text>
                </View>
              </View>
              <View style={styles.creatorMaxBtn}>
                <Text style={styles.creatorMaxText}>MAX</Text>
              </View>
            </View>

            {/* Progress bar */}
            <View style={styles.creatorProgressSection}>
              <View style={styles.creatorProgressNumbers}>
                <Text style={styles.creatorProgressNum}>{creatorStats.charmXp.toLocaleString()}</Text>
                <Text style={styles.creatorProgressNum}>{creatorStats.nextLevelXp.toLocaleString()}</Text>
              </View>
              <View style={styles.creatorProgressBar}>
                {(() => {
                  const pct = creatorStats.nextLevelXp > 0
                    ? Math.min(Math.floor((creatorStats.charmXp / creatorStats.nextLevelXp) * 100), 99)
                    : 0;
                  return (
                    <View style={[styles.creatorProgressFill, { width: `${pct}%` }]}>
                      <Text style={styles.creatorProgressPct}>{pct}%</Text>
                    </View>
                  );
                })()}
              </View>
              <View style={styles.creatorMaxRewardRow}>
                <TouchableOpacity style={styles.creatorHelpBtn}>
                  <Text style={styles.creatorHelpText}>?</Text>
                </TouchableOpacity>
                <Text style={styles.creatorMaxRewardText}>Maximum Reward:  🏆 {creatorStats.earnerScore.toLocaleString()}</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* ── Period strip (creator tab only) ── */}
      {mainTab === 'creator' && (
        <>
          <View style={styles.periodStrip}>
            <View style={styles.periodStripLeft}>
              <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.periodStripTimer}>DAY: {dayCountdown}</Text>
            </View>
            <TouchableOpacity
              style={styles.periodStripRight}
              onPress={() => setPeriod(period === 'daily' ? 'weekly' : 'daily')}
            >
              <Ionicons name="swap-horizontal-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.periodStripCurrent}>
                {period === 'daily' ? 'Today' : 'Weekly'}
              </Text>
            </TouchableOpacity>
          </View>
          {period === 'weekly' && (
            <Text style={styles.rewardNote}>🏆 Rewards distributed at end of week</Text>
          )}
        </>
      )}

      {/* ── Content ── */}
      {loading ? (
        <RankingSkeleton rows={6} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: insets.bottom + Spacing.xxxl,
            paddingHorizontal: Spacing.md,
            paddingTop: Spacing.md,
            gap: Spacing.sm,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#FFD700"
              colors={['#FFD700']}
            />
          }
          renderItem={({ item }) => <AgentRankCard entry={item} />}
          ListFooterComponent={
            mainTab === 'creator' ? (
              <View style={styles.footer}>
                <View style={styles.footerCard}>
                  <Text style={styles.footerLabel}>My Rank — </Text>
                  <Text style={styles.footerRankText}>{creatorMyRank?.rank ?? '--'}</Text>
                  <View style={styles.footerDivider} />
                  <Text style={styles.footerLabel}>Distance from Rank 1: </Text>
                  <Image source={require('../../../assets/ranking/reward.png')} style={styles.footerRewardIcon} />
                  <Text style={styles.footerScore}>{myDistance.toLocaleString()}</Text>
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyCenter}>
              <Ionicons
                name={mainTab === 'game' ? 'game-controller-outline' : 'trophy-outline'}
                size={48}
                color={Colors.textTertiary}
              />
              <Text style={styles.emptyText}>{emptyMessage}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ── Top 3 Section ────────────────────────────────────────────────────────────

function Top3Section({ entries, mainTab }: { entries: LeaderboardUserEntry[]; mainTab: MainTab }) {
  if (entries.length === 0) return null;

  const first = entries[0];
  const second = entries.length > 1 ? entries[1] : null;
  const third = entries.length > 2 ? entries[2] : null;

  return (
    <LinearGradient colors={BANNER_GRADIENTS[mainTab]} style={styles.top3Container}>
      <View style={styles.top3Row}>
        {/* 2nd place */}
        <View style={styles.top3Item}>
          {second && (
            <>
              <View style={styles.crownBadge}>
                <Text style={styles.crownText}>2</Text>
              </View>
              <View style={[styles.top3Avatar, styles.top3AvatarSilver]}>
                <UserAvatar
                  user={{
                    displayName: second.displayName,
                    avatar: second.avatar,
                    equippedFrame: second.equippedFrame ?? null,
                  }}
                  size={56}
                />
              </View>
              <Text style={styles.top3Name} numberOfLines={1}>{second.displayName}</Text>
              <ScoreLabel score={second.score} />
            </>
          )}
        </View>

        {/* 1st place */}
        <View style={[styles.top3Item, styles.top3ItemFirst]}>
          <View style={[styles.crownBadge, styles.crownBadgeGold]}>
            <Ionicons name="trophy" size={14} color="#FFD700" />
          </View>
          <View style={[styles.top3Avatar, styles.top3AvatarGold, styles.top3AvatarLarge]}>
            <UserAvatar
              user={{
                displayName: first.displayName,
                avatar: first.avatar,
                equippedFrame: first.equippedFrame ?? null,
              }}
              size={72}
            />
          </View>
          <Text style={[styles.top3Name, styles.top3NameFirst]} numberOfLines={1}>{first.displayName}</Text>
          <ScoreLabel score={first.score} large />
        </View>

        {/* 3rd place */}
        <View style={styles.top3Item}>
          {third && (
            <>
              <View style={styles.crownBadge}>
                <Text style={styles.crownText}>3</Text>
              </View>
              <View style={[styles.top3Avatar, styles.top3AvatarBronze]}>
                <UserAvatar
                  user={{
                    displayName: third.displayName,
                    avatar: third.avatar,
                    equippedFrame: third.equippedFrame ?? null,
                  }}
                  size={56}
                />
              </View>
              <Text style={styles.top3Name} numberOfLines={1}>{third.displayName}</Text>
              <ScoreLabel score={third.score} />
            </>
          )}
        </View>
      </View>
    </LinearGradient>
  );
}

// ── Score label ──────────────────────────────────────────────────────────────

function ScoreLabel({ score, large }: { score: number; large?: boolean }) {
  return (
    <View style={styles.scoreRow}>
      <Text style={styles.scoreCoin}>🪙</Text>
      <Text style={[styles.scoreText, large && styles.scoreTextFirst]}>{score.toLocaleString()}</Text>
    </View>
  );
}

// ── Agent Rank Card ───────────────────────────────────────────────────────────

function AgentRankCard({ entry }: { entry: LeaderboardUserEntry }) {
  const isBelow = entry.rank >= 4;

  const gradColors: [string, string] =
    entry.rank === 1 ? ['#FFB021', '#F6C875'] :
    entry.rank === 2 ? ['#7897D9', '#3C76F3'] :
    entry.rank === 3 ? ['#CF9067', '#E07630'] :
    ['#6BA1C5', '#6BA1C5'];

  return (
    <LinearGradient
      colors={gradColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[styles.agentCard, styles.agentCardTop]}
    >
      {/* Avatar */}
      <View style={styles.agentAvatarWrap}>
        <UserAvatar
          user={{
            displayName: entry.displayName,
            avatar: entry.avatar,
            equippedFrame: entry.equippedFrame ?? null,
          }}
          size={56}
        />
      </View>

      {/* Info */}
      <View style={styles.agentInfo}>
        <View style={styles.agentNameRow}>
          <Text style={[styles.agentName, isBelow && styles.agentNameWhite]} numberOfLines={1}>
            {entry.displayName}
          </Text>
          {isBelow && <Text style={styles.agentFlagIcon}>🏳️</Text>}
        </View>
        <View style={styles.agentBadgeRow}>
          {entry.richLevel != null && entry.richLevel > 0 && (
            <Image
              source={RICH[Math.min(Math.max(entry.richLevel, 1), 100)] ?? RICH[1]}
              style={styles.agentLevelImg}
              contentFit="contain"
            />
          )}
          {entry.charmLevel != null && entry.charmLevel > 0 && (
            <Image
              source={CHARM[Math.min(Math.max(entry.charmLevel, 0), 100)] ?? CHARM[0]}
              style={styles.agentLevelImg}
              contentFit="contain"
            />
          )}
        </View>
        <View style={styles.agentBeanRow}>
          {isBelow && <Text style={styles.agentRewardLabel}>Reward: </Text>}
          <Image source={require('../../../assets/ranking/reward.png')} style={styles.agentIconImg} />
          <Text style={styles.agentBeanText}>{entry.score.toLocaleString()}</Text>
        </View>
      </View>

      {/* Right: coin + received/unreceived */}
      <View style={styles.agentRight}>
        <View style={styles.agentCoinRow}>
          <Image source={require('../../../assets/ranking/coin.png')} style={styles.agentIconImg} />
          <Text style={styles.agentCoinAmount}>{entry.score.toLocaleString()}</Text>
        </View>
        {isBelow ? (
          <View style={styles.agentReceivedPill}>
            <Text style={styles.agentReceived}>Received</Text>
          </View>
        ) : (
          <View style={styles.agentUnreceivedPill}>
            <Text style={styles.agentUnreceived}>Unreceived</Text>
          </View>
        )}
      </View>
    </LinearGradient>
  );
}

// ── Rank Row ─────────────────────────────────────────────────────────────────


// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },

  // Header (lives inside banner, no background of its own)
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    width: '100%',
  },
  mainTabRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(120,120,120,0.45)',
    borderRadius: Radius.full,
    paddingHorizontal: 3,
    paddingVertical: 3,
  },
  mainTabItem: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  mainTabItemActive: {
    backgroundColor: '#FFFFFF',
  },
  mainTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.75)',
  },
  mainTabTextActive: {
    color: '#E8A020',
    fontWeight: '700',
  },

  // Banner (also contains the header row)
  banner: {
    paddingBottom: Spacing.sm,
    paddingHorizontal: 0,
    gap: Spacing.xs,
    alignItems: 'center',
    overflow: 'hidden',
    minHeight: 320,
  },
  bannerImage: {
    width: '100%',
    height: 200,
  },
  bannerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFD700',
    letterSpacing: 1,
    textShadowColor: 'rgba(255,215,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  subTabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(69,65,60,0.5)',
    borderRadius: 20,
    gap: 0,
    paddingHorizontal: 0,
  },
  subTabPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  subTabPillActive: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subTabText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FFFFFF',
    letterSpacing: -0.33,
    textAlign: 'center',
  },
  subTabTextActive: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -0.33,
    textAlign: 'center',
  },
  periodRow: {
    flexDirection: 'row',
    gap: Spacing.xl,
  },
  periodItem: {
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  periodText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.4)',
  },
  periodTextActive: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  periodUnderline: {
    marginTop: 4,
    width: 20,
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.textPrimary,
  },

  // Loading
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Top 3
  top3Container: {
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  top3Row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: Spacing.md,
  },
  top3Item: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  top3ItemFirst: {
    marginBottom: Spacing.md,
  },
  crownBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  crownBadgeGold: {
    backgroundColor: 'rgba(255,215,0,0.25)',
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  crownText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
  },
  top3Avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  top3AvatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
  },
  top3AvatarGold: {
    borderColor: '#FFD700',
  },
  top3AvatarSilver: {
    borderColor: '#C0C0C0',
  },
  top3AvatarBronze: {
    borderColor: '#CD7F32',
  },
  top3AvatarImg: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  top3AvatarImgLarge: {
    width: 66,
    height: 66,
    borderRadius: 33,
  },
  top3Name: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
    maxWidth: 90,
    textAlign: 'center',
  },
  top3NameFirst: {
    fontSize: 14,
    fontWeight: '700',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoreCoin: {
    fontSize: 12,
  },
  scoreText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.gold,
  },
  scoreTextFirst: {
    fontSize: 14,
  },

  // Rank list rows
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    gap: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rankNum: {
    fontSize: 16,
    fontWeight: '800',
    width: 28,
    textAlign: 'center',
  },
  rankAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'visible',
  },
  rankAvatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  rankAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankInfo: {
    flex: 1,
    gap: 2,
  },
  rankName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  rankId: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  rankScoreCol: {
    alignItems: 'flex-end',
    gap: 1,
  },
  rankScore: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFD700',
  },
  rankScoreLabel: {
    fontSize: 10,
    color: 'rgba(255,215,0,0.6)',
    fontWeight: '500',
  },

  // Agent rank card
  agentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#F5C842',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    gap: Spacing.sm,
  },
  agentCardTop: {
    borderWidth: 3,
    borderColor: '#E5DB1A',
    shadowColor: '#000',
    shadowOffset: { width: 3, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 6,
  },
  agentRank: {
    fontSize: 16,
    fontWeight: '800',
    width: 22,
    textAlign: 'center',
  },
  agentAvatarWrap: {
    position: 'relative',
  },
  agentCrown: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  agentInfo: {
    flex: 1,
    gap: 2,
  },
  agentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  agentIdText: {
    fontSize: 11,
    color: '#666680',
  },
  agentBeanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  agentBeanIcon: {
    fontSize: 12,
  },
  agentIconImg: {
    width: 24,
    height: 24,
  },
  agentBeanText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#000000',
  },
  agentRight: {
    alignItems: 'flex-end',
    gap: 3,
  },
  agentCoinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  agentCoinBubble: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#E8A020',
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentCoinSymbol: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  agentCoinAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  agentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  agentNameWhite: {
    color: '#FFFFFF',
  },
  agentFlagIcon: {
    fontSize: 14,
  },
  agentRewardLabel: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FFFFFF',
  },
  agentUnreceivedPill: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  agentUnreceived: {
    fontSize: 12,
    color: '#000000',
    textAlign: 'center',
  },
  agentReceivedPill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  agentReceived: {
    fontSize: 12,
    color: '#F24822',
    textAlign: 'center',
  },
  agentBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: 2,
  },
  agentLevelImg: {
    width: 48,
    height: 20,
  },
  agentLvBadge: {
    backgroundColor: '#5F22D9',
    borderRadius: 20,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  agentLvText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FFFFFF',
  },
  agentCharmBadge: {
    backgroundColor: '#FE6BE4',
    borderRadius: 20,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  agentCharmText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  agentRewardBadge: {
    backgroundColor: '#22C97A',
    borderRadius: Radius.xs,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  agentRewardText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },

  // Activity overlay
  creatorOverlay: {
    width: '100%',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  creatorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#7B22CC',
    borderWidth: 2,
    borderColor: '#FFD700',
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.sm,
    gap: Spacing.md,
  },
  creatorCardInner: {
    gap: 6,
  },
  creatorCardText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  creatorLevelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  creatorStarImg: {
    width: 18,
    height: 18,
  },
  creatorRewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  creatorRewardImg: {
    width: 18,
    height: 18,
  },
  creatorMaxBtn: {
    backgroundColor: '#FFD700',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minWidth: 50,
    alignItems: 'center',
  },
  creatorMaxText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1A1A2E',
  },
  creatorProgressSection: {
    gap: 6,
    width: '100%',
  },
  creatorProgressNumbers: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  creatorProgressNum: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  creatorProgressBar: {
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  creatorProgressFill: {
    width: '50%',
    height: '100%',
    backgroundColor: '#E8A020',
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorProgressPct: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  creatorMaxRewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  creatorHelpBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorHelpText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
  },
  creatorMaxRewardText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  creatorSelectorsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingBottom: Spacing.sm,
    width: '100%',
  },
  creatorSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    gap: 4,
  },
  creatorSelectorText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },

  // Period strip
  periodStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  periodStripLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  periodStripTimer: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  periodStripRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  periodStripCurrent: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  rewardNote: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingBottom: Spacing.xs,
  },

  // Footer
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  footerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  footerLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  footerRankText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  footerDivider: {
    width: 1,
    height: 16,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
  },
  footerCoin: {
    fontSize: 12,
  },
  footerRewardIcon: {
    width: 16,
    height: 16,
  },
  footerScore: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.gold,
    marginLeft: 4,
  },

  // Empty
  emptyCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxxl * 2,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textTertiary,
  },
});
