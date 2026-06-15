import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { leaderboardApi } from '@api/leaderboard';
import { useMock } from '@api/config';
import { mockGameTeenPattiRank, mockGameTopGamerRank } from '@api/mock/ranking';
import { queryKeys } from '@api/queryKeys';
import { Colors, Spacing, Radius } from '@/theme';
import { RankingSkeleton } from '@components/Skeleton';
import type { LeaderboardUserEntry } from '@/types';
import type { RootStackParamList } from '@navigation/types';
import type { RootState } from '@store/index';
import { RankingFrameRow } from './RankingFrameRow';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type MainTab = 'state' | 'agent' | 'game' | 'creator';
type GameSubTab = 'top_gamer' | 'teen_patti';

const MAIN_TABS: { key: MainTab; label: string }[] = [
  { key: 'state', label: 'State' },
  { key: 'agent', label: 'Agent' },
  { key: 'game', label: 'Game' },
  { key: 'creator', label: 'Activity' },
];

const GAME_SUB_TABS: { key: GameSubTab; label: string }[] = [
  { key: 'top_gamer', label: 'Top Gamer' },
  { key: 'teen_patti', label: 'Teen Patti' },
];

const GAME_BACKGROUND = require('../../../assets/ranking/game/game-background.png');
const GAME_LIST_BG = require('../../../assets/ranking/game/list-bg.png');
const DIAMOND_ICON = require('../../../assets/ranking/game/diamond.png');

const GAME_SUB_TAB_MARGIN_TOP = Spacing.xxxxl + Spacing.xl;
const GAME_DESIGN_W = 402;
const GAME_LIST_BG_W = 374;
/** Header row + sub-tab pills — used to position the list panel below the hero overlay. */
const GAME_HEADER_ROW_H = 40;
const GAME_SUB_TAB_ROW_H = 38;
const GAME_LIST_HORIZONTAL_PAD = Spacing.md;
const GAME_BG_COLOR = '#4BB3FF';

function GameListPanelBackground() {
  return (
    <Image
      source={GAME_LIST_BG}
      style={StyleSheet.absoluteFill}
      contentFit="fill"
      cachePolicy="memory-disk"
    />
  );
}

function formatNum(n: number): string {
  return n.toLocaleString();
}

const DISTANCE_FOOTER_H = 48;

type Props = {
  navigation: Nav;
  onTabChange: (tab: MainTab) => void;
};

export function GameTab({ navigation, onTabChange }: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const user = useSelector((s: RootState) => s.auth.user);

  const listPanelInset = Math.round((screenWidth * (GAME_DESIGN_W - GAME_LIST_BG_W)) / (2 * GAME_DESIGN_W));
  const listPanelWidth = screenWidth - listPanelInset * 2;
  /** Keep rows inside the list panel with left/right inset from the panel edges. */
  const rowDisplayW = listPanelWidth - GAME_LIST_HORIZONTAL_PAD * 2;
  /** List panel starts below sub-tabs and stretches down to the distance footer. */
  const listPanelTop =
    insets.top + GAME_HEADER_ROW_H + GAME_SUB_TAB_MARGIN_TOP + GAME_SUB_TAB_ROW_H + Spacing.xs;

  const [subTab, setSubTab] = useState<GameSubTab>('top_gamer');
  const [periodLabel, setPeriodLabel] = useState<'Current' | 'Previous'>('Current');
  const [countdown, setCountdown] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const rankingQuery = useQuery({
    queryKey: queryKeys.ranking.list({ mainTab: 'game', period: 'monthly', subTab, periodLabel }),
    queryFn: () => leaderboardApi.getGameRank(subTab),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const apiData = rankingQuery.data ?? [];
  const data = useMemo(() => {
    if (apiData.length > 0) {
      if (periodLabel === 'Previous') {
        return apiData.map((row) => ({ ...row, score: Math.round(row.score * 0.85) }));
      }
      return apiData;
    }
    const useFixture = useMock || __DEV__;
    if (!useFixture) return [];
    const base = subTab === 'teen_patti' ? mockGameTeenPattiRank : mockGameTopGamerRank;
    const scaled = periodLabel === 'Previous'
      ? base.map((row) => ({ ...row, score: Math.round(row.score * 0.85) }))
      : base;
    return scaled;
  }, [apiData, periodLabel, subTab]);

  const loading = data.length === 0 && rankingQuery.isLoading;

  const myEntry = useMemo(
    () => (user?.id ? data.find((row) => row.id === user.id) : undefined),
    [data, user?.id],
  );
  const myScore = myEntry?.score ?? 0;

  const distanceFromRankAbove = useMemo(() => {
    if (data.length === 0) return null;
    if (myEntry) {
      if (myEntry.rank <= 1) return 0;
      const rankAbove = data.find((row) => row.rank === myEntry.rank - 1);
      if (rankAbove) return Math.max(0, rankAbove.score - myEntry.score);
      const idx = data.findIndex((row) => row.id === myEntry.id);
      if (idx > 0) return Math.max(0, data[idx - 1]!.score - myEntry.score);
      return 0;
    }
    const lowestRanked = data[data.length - 1];
    if (!lowestRanked) return null;
    return Math.max(0, lowestRanked.score - myScore + 1);
  }, [data, myEntry, myScore]);

  const showDistanceFooter = data.length > 0 && distanceFromRankAbove != null;
  const footerHeight = showDistanceFooter
    ? DISTANCE_FOOTER_H + Spacing.md + insets.bottom + Spacing.sm
    : insets.bottom + Spacing.sm;

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const endOfMonth = new Date();
      endOfMonth.setMonth(endOfMonth.getMonth() + 1, 0);
      endOfMonth.setHours(23, 59, 59, 999);
      const diffMs = Math.max(0, endOfMonth.getTime() - now);
      const days = Math.floor(diffMs / 86_400_000);
      const hh = Math.floor((diffMs % 86_400_000) / 3_600_000);
      const mm = Math.floor((diffMs % 3_600_000) / 60_000);
      const ss = Math.floor((diffMs % 60_000) / 1_000);
      setCountdown(
        `${days}d ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`,
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

  const listHeader = useMemo(
    () => (
      <View style={styles.listToolbar}>
        <View style={styles.timerPill}>
          <Ionicons name="time-outline" size={14} color={Colors.textInverse} />
          <Text style={styles.timerText}>{countdown}</Text>
        </View>
        <TouchableOpacity
          style={styles.timerPill}
          onPress={() => setPeriodLabel((p) => (p === 'Current' ? 'Previous' : 'Current'))}
        >
          <Ionicons name="swap-horizontal-outline" size={14} color={Colors.textInverse} />
          <Text style={styles.timerText}>{periodLabel}</Text>
        </TouchableOpacity>
      </View>
    ),
    [countdown, periodLabel],
  );

  const listPanelStyle = [
    styles.listPanel,
    {
      top: listPanelTop,
      left: listPanelInset,
      right: listPanelInset,
      bottom: 0,
    },
  ];

  const listContentPaddingBottom = footerHeight + Spacing.md;

  return (
    <View style={styles.screen}>
      <Image
        source={GAME_BACKGROUND}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition="top"
        cachePolicy="memory-disk"
      />

      <View style={listPanelStyle}>
        <GameListPanelBackground />

        {loading ? (
          <View style={[styles.loadingWrap, { paddingHorizontal: GAME_LIST_HORIZONTAL_PAD }]}>
            <RankingSkeleton rows={6} />
          </View>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={listHeader}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.listContent,
              {
                paddingHorizontal: GAME_LIST_HORIZONTAL_PAD,
                paddingBottom: listContentPaddingBottom,
              },
            ]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={Colors.textInverse}
                colors={[Colors.textInverse]}
              />
            }
            renderItem={({ item }) => (
              <RankingFrameRow entry={item} displayW={rowDisplayW} variant="game" />
            )}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="game-controller-outline" size={48} color="rgba(255,255,255,0.45)" />
                <Text style={styles.emptyText}>No rankings yet</Text>
              </View>
            }
          />
        )}
      </View>

      <View style={[styles.topSection, { paddingTop: insets.top }]} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={Colors.textInverse} />
          </TouchableOpacity>
          <View style={styles.mainTabRow}>
            {MAIN_TABS.map((tab) => {
              const isActive = tab.key === 'game';
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => onTabChange(tab.key)}
                  style={[styles.mainTabItem, isActive && styles.mainTabItemActive]}
                >
                  <Text style={[styles.mainTabText, isActive && styles.mainTabTextActive]}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity hitSlop={8}>
            <Ionicons name="help-circle-outline" size={22} color={Colors.textInverse} />
          </TouchableOpacity>
        </View>

        <View style={[styles.subTabRow, { marginTop: GAME_SUB_TAB_MARGIN_TOP }]}>
          {GAME_SUB_TABS.map((tab) => {
            const isActive = subTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setSubTab(tab.key)}
                style={[styles.subTabItem, isActive && styles.subTabItemActive]}
              >
                <Text style={[styles.subTabText, isActive && styles.subTabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {showDistanceFooter ? (
        <View style={[styles.distanceFooter, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <Text style={styles.distanceFooterLabel}>Distance from rank is: </Text>
          <Image source={DIAMOND_ICON} style={styles.distanceFooterIcon} contentFit="contain" />
          <Text style={styles.distanceFooterValue}>{formatNum(distanceFromRankAbove)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: GAME_BG_COLOR },
  listPanel: {
    position: 'absolute',
    overflow: 'hidden',
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
  },
  listContent: {
    paddingBottom: Spacing.md,
  },
  loadingWrap: {
    flex: 1,
    paddingTop: Spacing.md,
  },
  listToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    zIndex: 1,
  },
  topSection: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    zIndex: 2,
  },
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
  mainTabItem: { flex: 1, borderRadius: Radius.full, overflow: 'hidden', alignItems: 'center' },
  mainTabItemActive: { backgroundColor: '#FFFFFF' },
  mainTabText: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    paddingVertical: 6,
  },
  mainTabTextActive: { color: '#D4880A', fontWeight: '700' },
  subTabRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  subTabItem: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  subTabItemActive: {
    borderColor: Colors.background,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  subTabText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.75)',
  },
  subTabTextActive: {
    color: Colors.textInverse,
    fontWeight: '700',
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.28)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  timerText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textInverse,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxxl * 2,
    gap: Spacing.md,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 16,
    fontWeight: '600',
  },
  distanceFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    zIndex: 10,
    elevation: 10,
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
});
