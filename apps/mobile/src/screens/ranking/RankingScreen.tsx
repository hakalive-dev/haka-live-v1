import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  Animated,
  Easing,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSelector } from 'react-redux';

import { UserAvatar } from '@components/UserAvatar';
import { leaderboardApi } from '@api/leaderboard';
import { useMock } from '@api/config';
import { mockActivityHostsRank } from '@api/mock/ranking';
import { queryKeys } from '@api/queryKeys';
import type { LeaderboardWindow, CreatorStats } from '@api/leaderboard';
import { Colors, Spacing, Radius } from '@/theme';
import { RankingSkeleton } from '@components/Skeleton';
import type { LeaderboardUserEntry } from '@/types';
import type { RootStackParamList, RootStackScreenProps } from '@navigation/types';
import type { RootState } from '@store/index';
import { StateStarTab } from './StateStarTab';
import { AgentTab } from './AgentTab';
import { GameTab } from './GameTab';
import { RankingFrameRow } from './RankingFrameRow';

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

const CREATOR_EMPTY_MESSAGE = 'No rankings yet';

const ACTIVITY_COIN_ICON = require('../../../assets/ranking/coin.png');
const ACTIVITY_BACKGROUND = require('../../../assets/ranking/activity-background.png');
const ACTIVITY_BG_W = 402;
const ACTIVITY_BG_H = 898;
const ACTIVITY_HEADER_VISIBLE_RATIO = 0.32;
/** Pulls the list panel up over the hero background. */
const ACTIVITY_LIST_PANEL_LIFT = Spacing.xxxl;
const ACTIVITY_BG_COLOR = '#12081A';
const ACTIVITY_LIST_BG = require('../../../assets/ranking/game/list-bg.png');
const ACTIVITY_LIST_BG_W = 374;
const ACTIVITY_LIST_HORIZONTAL_PAD = Spacing.md;

function ActivityListPanelBackground() {
  return (
    <Image
      source={ACTIVITY_LIST_BG}
      style={StyleSheet.absoluteFill}
      contentFit="fill"
      cachePolicy="memory-disk"
    />
  );
}

const ACTIVITY_RANK_NOTICE_TEXT =
  "We rewards for the next rank, If they don't meet the house";

const DISTANCE_FOOTER_H = 48;
const ACTIVITY_RANK_NOTICE_BANNER_H = 44;
const MARQUEE_GAP = Spacing.xl;

const TAB_BG_COLORS: Record<MainTab, string> = {
  state:   '#1A0A28',
  agent:   '#0D1119',
  game:    '#47014A',
  creator: ACTIVITY_BG_COLOR,
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
  const { width: screenWidth } = useWindowDimensions();
  const user = useSelector((s: RootState) => s.auth.user);
  const activityBgHeight = screenWidth * (ACTIVITY_BG_H / ACTIVITY_BG_W);
  const headerHeight = Math.round(activityBgHeight * ACTIVITY_HEADER_VISIBLE_RATIO);
  const listPanelInset = Math.round(
    (screenWidth * (ACTIVITY_BG_W - ACTIVITY_LIST_BG_W)) / (2 * ACTIVITY_BG_W),
  );
  const listPanelWidth = screenWidth - listPanelInset * 2;
  const rowDisplayW = listPanelWidth - ACTIVITY_LIST_HORIZONTAL_PAD * 2;
  const listPanelTop = insets.top + headerHeight - ACTIVITY_LIST_PANEL_LIFT;

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
    queryFn: () => leaderboardApi.getByCategory('creator_hosts', period),
    enabled: mainTab === 'creator',
    staleTime: 60_000,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
  const apiData: LeaderboardUserEntry[] = rankingQuery.data ?? [];
  const data = useMemo(() => {
    if (apiData.length > 0) return apiData;
    const useFixture = useMock || __DEV__;
    if (!useFixture) return [];
    return mockActivityHostsRank[period];
  }, [apiData, period]);
  const loading = data.length === 0 && rankingQuery.isLoading;
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

  const myEntry = useMemo(
    () => (user?.id ? data.find((row) => row.id === user.id) : undefined),
    [data, user?.id],
  );

  const myScore = myEntry?.score ?? creatorStats?.earnerScore ?? 0;

  const distanceFromRankAbove = useMemo(() => {
    if (data.length === 0) return null;
    const rankedSelf =
      myEntry ??
      (creatorStats?.earnerRank != null && creatorStats.earnerRank > 0
        ? { rank: creatorStats.earnerRank, score: creatorStats.earnerScore, id: user?.id ?? '' }
        : undefined);
    if (rankedSelf) {
      if (rankedSelf.rank <= 1) return 0;
      const rankAbove = data.find((row) => row.rank === rankedSelf.rank - 1);
      if (rankAbove) return Math.max(0, rankAbove.score - rankedSelf.score);
      const idx = data.findIndex((row) => row.rank === rankedSelf.rank);
      if (idx > 0) return Math.max(0, data[idx - 1]!.score - rankedSelf.score);
      return 0;
    }
    const lowestRanked = data[data.length - 1];
    if (!lowestRanked) return null;
    return Math.max(0, lowestRanked.score - myScore + 1);
  }, [data, myEntry, creatorStats, myScore, user?.id]);

  const showDistanceFooter = data.length > 0 && distanceFromRankAbove != null;
  const activityFooterBlockH =
    ACTIVITY_RANK_NOTICE_BANNER_H + Spacing.sm * 2 + DISTANCE_FOOTER_H + Spacing.md * 2;
  const footerHeight = showDistanceFooter
    ? activityFooterBlockH + insets.bottom + Spacing.sm
    : insets.bottom + Spacing.sm;

  const emptyMessage = CREATOR_EMPTY_MESSAGE;

  if (mainTab === 'state') {
    return <StateStarTab navigation={navigation} onTabChange={handleMainTabChange} />;
  }

  if (mainTab === 'agent') {
    return <AgentTab navigation={navigation} onTabChange={handleMainTabChange} />;
  }

  if (mainTab === 'game') {
    return <GameTab navigation={navigation} onTabChange={handleMainTabChange} />;
  }

  const listHeader = (
    <>
      <View style={styles.activityListToolbar}>
        <View style={styles.periodStripLeft}>
          <Ionicons name="time-outline" size={14} color={Colors.textInverse} />
          <Text style={styles.activityPeriodStripTimer}>DAY: {dayCountdown}</Text>
        </View>
        <TouchableOpacity
          style={styles.periodStripRight}
          onPress={() => setPeriod(period === 'daily' ? 'weekly' : 'daily')}
        >
          <Ionicons name="swap-horizontal-outline" size={14} color={Colors.textInverse} />
          <Text style={styles.activityPeriodStripCurrent}>
            {period === 'daily' ? 'Today' : 'Weekly'}
          </Text>
        </TouchableOpacity>
      </View>
      {period === 'weekly' ? (
        <Text style={styles.activityRewardNote}>🏆 Rewards distributed at end of week</Text>
      ) : null}
    </>
  );

  const listPanelStyle = [
    styles.activityListPanel,
    {
      top: listPanelTop,
      left: listPanelInset,
      right: listPanelInset,
      bottom: 0,
    },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: TAB_BG_COLORS[mainTab] }]}>
      <Image
        source={ACTIVITY_BACKGROUND}
        style={[styles.activityBackground, { width: screenWidth, height: activityBgHeight }]}
        contentFit="fill"
        contentPosition="top"
        cachePolicy="memory-disk"
        allowDownscaling={false}
      />

      {loading ? (
        <View style={listPanelStyle}>
          <ActivityListPanelBackground />
          <View style={[styles.loadingWrap, { paddingHorizontal: ACTIVITY_LIST_HORIZONTAL_PAD }]}>
            <RankingSkeleton rows={6} />
          </View>
        </View>
      ) : (
        <View style={listPanelStyle}>
          <ActivityListPanelBackground />
          <FlatList
            style={styles.list}
            data={data}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={listHeader}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingBottom: footerHeight,
              paddingHorizontal: ACTIVITY_LIST_HORIZONTAL_PAD,
            }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor="#FFD700"
                colors={['#FFD700']}
              />
            }
            renderItem={({ item }) => (
              <RankingFrameRow entry={item} displayW={rowDisplayW} variant="activity" />
            )}
            ListEmptyComponent={
              <View style={styles.emptyCenter}>
                <Ionicons name="trophy-outline" size={48} color={Colors.textTertiary} />
                <Text style={styles.emptyText}>{emptyMessage}</Text>
              </View>
            }
          />
        </View>
      )}

      <View style={[styles.creatorTopSection, { paddingTop: insets.top }]} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={Colors.textInverse} />
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
          <TouchableOpacity hitSlop={8}>
            <Ionicons name="help-circle-outline" size={22} color={Colors.textInverse} />
          </TouchableOpacity>
        </View>
      </View>

      {showDistanceFooter ? (
        <View style={styles.activityFooterWrap}>
          <View style={styles.rankRewardBanner}>
            <ActivityRankNoticeMarquee text={ACTIVITY_RANK_NOTICE_TEXT} />
          </View>
          <View style={[styles.distanceFooter, { paddingBottom: insets.bottom + Spacing.sm }]}>
            <Text style={styles.distanceFooterLabel}>Distance from rank is: </Text>
            <Image source={ACTIVITY_COIN_ICON} style={styles.distanceFooterIcon} contentFit="contain" />
            <Text style={styles.distanceFooterValue}>
              {distanceFromRankAbove.toLocaleString()}
            </Text>
          </View>
        </View>
      ) : null}
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

// ── Activity rank notice marquee ─────────────────────────────────────────────

function ActivityRankNoticeMarquee({ text }: { text: string }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [segmentWidth, setSegmentWidth] = useState(0);

  useEffect(() => {
    if (segmentWidth <= 0) return;

    translateX.setValue(0);
    const distance = segmentWidth + MARQUEE_GAP;
    const duration = Math.max(10_000, distance * 28);
    const anim = Animated.loop(
      Animated.timing(translateX, {
        toValue: -distance,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [segmentWidth, translateX]);

  return (
    <View style={styles.marqueeClip}>
      <Animated.View
        style={[
          styles.marqueeTrack,
          segmentWidth > 0 ? { transform: [{ translateX }] } : null,
        ]}
      >
        <Text
          style={styles.rankRewardBannerText}
          onLayout={(e) => {
            const width = e.nativeEvent.layout.width;
            if (width > 0) setSegmentWidth(width);
          }}
        >
          {text}
        </Text>
        <View style={{ width: MARQUEE_GAP }} />
        <Text style={styles.rankRewardBannerText}>{text}</Text>
      </Animated.View>
    </View>
  );
}

// ── Rank Row ─────────────────────────────────────────────────────────────────


// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  activityBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  list: {
    flex: 1,
  },
  activityListPanel: {
    position: 'absolute',
    overflow: 'hidden',
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
  },
  activityListToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  activityPeriodStripTimer: {
    fontSize: 13,
    color: Colors.textInverse,
    fontWeight: '600',
  },
  activityPeriodStripCurrent: {
    fontSize: 13,
    color: Colors.textInverse,
    fontWeight: '600',
  },
  activityRewardNote: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    paddingBottom: Spacing.xs,
  },

  banner: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    overflow: 'hidden',
    minHeight: 320,
  },
  bannerInner: {
    flex: 1,
    justifyContent: 'space-between',
    position: 'relative',
    minHeight: 280,
  },
  bannerSpacer: { flex: 1, minHeight: Spacing.md },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  mainTabRow: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(60,60,60,0.55)',
    borderRadius: Radius.full,
    padding: 3,
  },
  mainTabItem: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  mainTabItemActive: {
    backgroundColor: '#FFFFFF',
  },
  mainTabText: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.8)',
  },
  mainTabTextActive: {
    color: '#D4880A',
    fontWeight: '700',
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
  loadingWrap: {
    flex: 1,
  },
  creatorTopSection: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.md,
    zIndex: 2,
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

  distanceFooter: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: Colors.surface,
    borderRadius: 0,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
    minHeight: DISTANCE_FOOTER_H + Spacing.md,
  },
  activityFooterWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    zIndex: 10,
    elevation: 10,
  },
  rankRewardBanner: {
    backgroundColor: Colors.primary,
    overflow: 'hidden',
    minHeight: ACTIVITY_RANK_NOTICE_BANNER_H,
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
  },
  marqueeClip: {
    overflow: 'hidden',
    width: '100%',
  },
  marqueeTrack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankRewardBannerText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  distanceFooterLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  distanceFooterIcon: {
    width: 16,
    height: 16,
    marginLeft: 2,
  },
  distanceFooterValue: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textSecondary,
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
