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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { hostRewardAmount } from '@haka-live/shared-types/state-rankings';

import { stateRankingApi } from '@api/stateRanking';
import { useLeaderboardRealtime } from '@/hooks/useLeaderboardRealtime';
import { Colors, Spacing, Radius } from '@/theme';
import type { RootStackParamList } from '@navigation/types';
import type { RootState } from '@store/index';
import type { LeaderboardUserEntry } from '@/types';
import { RankingCountdownBoxes } from './RankingCountdownBoxes';
import { RankingFrameRow } from './RankingFrameRow';

type Props = NativeStackScreenProps<RootStackParamList, 'StateQueen'>;

const STATE_QUEEN_BACKGROUND = require('../../../assets/ranking/state-star/state-queen-background.png');

/** Native dimensions of `state-queen-background.png` (1×). */
const DESIGN_W = 378;
const DESIGN_H = 864;
/** Y-position on the asset where the host list panel begins. */
const LIST_START_RATIO = 0.42;
const STATE_NAME_CENTER_RATIO = 0.24;
const LIST_HORIZONTAL_PAD = Spacing.md;
const SCREEN_BG = '#1A0F00';
const FOOTER_H = 48;

type StateHostUser = {
  id: string;
  displayName: string;
  avatar: string | null;
  username?: string | null;
  hakaId?: string | null;
  equippedFrame?: LeaderboardUserEntry['equippedFrame'];
  activeSpecialId?: string | null;
  activeSpecialIdLevel?: string | null;
  richLevel?: number | null;
  charmLevel?: number | null;
};

function formatNum(n: number): string {
  return n.toLocaleString();
}

function rewardForHostRank(poolReward: number, rank: number): number | undefined {
  if (poolReward <= 0 || rank < 1 || rank > 4) return undefined;
  return hostRewardAmount(poolReward, rank as 1 | 2 | 3 | 4);
}

export function StateQueenScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const user = useSelector((s: RootState) => s.auth.user);
  const { stateCode, stateName, countryCode, stateRank: stateRankParam, poolReward: poolRewardParam } =
    route.params;

  const [countdown, setCountdown] = useState('00:00:00');
  const [refreshing, setRefreshing] = useState(false);

  const bgHeight = screenWidth * (DESIGN_H / DESIGN_W);
  const listPanelTop = Math.round(bgHeight * LIST_START_RATIO);
  const stateNameTop = insets.top + Math.round(bgHeight * STATE_NAME_CENTER_RATIO);
  const rowDisplayW = screenWidth - LIST_HORIZONTAL_PAD * 2;

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
      setCountdown(
        `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`,
      );
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, []);

  const needsMeta = stateRankParam == null || poolRewardParam == null;

  const statesMetaQuery = useQuery({
    queryKey: ['stateRanking', 'states', countryCode, 'stateQueenMeta'],
    queryFn: () => stateRankingApi.getStates(countryCode ? { countryCode } : undefined),
    enabled: needsMeta,
  });

  const hostsQuery = useQuery({
    queryKey: ['stateRanking', 'hosts', stateCode, countryCode],
    queryFn: () =>
      stateRankingApi.getStateHosts(stateCode, countryCode ? { countryCode } : undefined),
  });

  const myHostQuery = useQuery({
    queryKey: ['stateRanking', 'myHost', stateCode],
    queryFn: () => stateRankingApi.getMyHostRank(),
    enabled: user?.state?.toUpperCase() === stateCode.toUpperCase(),
  });

  const metaRow = useMemo(
    () => statesMetaQuery.data?.items.find((row) => row.stateCode === stateCode.toUpperCase()),
    [statesMetaQuery.data?.items, stateCode],
  );

  const stateRank = stateRankParam ?? metaRow?.rank;
  const poolReward = poolRewardParam ?? metaRow?.poolReward ?? 0;
  const shownCountry = countryCode ?? hostsQuery.data?.countryCode ?? statesMetaQuery.data?.countryCode;

  useLeaderboardRealtime({
    board: 'state',
    countryCode: shownCountry,
    enabled: !!shownCountry,
    onChanged: () => {
      void hostsQuery.refetch();
    },
  });

  const entries = useMemo((): LeaderboardUserEntry[] => {
    return (hostsQuery.data?.items ?? []).map((item) => {
      const hostUser = item.user as StateHostUser;
      return {
        rank: item.rank,
        score: item.score,
        id: hostUser.id,
        username: hostUser.username ?? null,
        displayName: hostUser.displayName,
        avatar: hostUser.avatar ?? null,
        hakaId: hostUser.hakaId ?? null,
        equippedFrame: hostUser.equippedFrame ?? null,
        activeSpecialId: hostUser.activeSpecialId ?? null,
        activeSpecialIdLevel: hostUser.activeSpecialIdLevel ?? null,
        richLevel: hostUser.richLevel ?? null,
        charmLevel: hostUser.charmLevel ?? null,
        stateCode,
      };
    });
  }, [hostsQuery.data?.items, stateCode]);

  const myRank = myHostQuery.data;
  const showFooter = myRank?.eligible && myRank.rank != null;
  const footerHeight = showFooter ? FOOTER_H + insets.bottom + Spacing.sm : insets.bottom + Spacing.sm;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        hostsQuery.refetch(),
        needsMeta ? statesMetaQuery.refetch() : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [hostsQuery, needsMeta, statesMetaQuery]);

  return (
    <View style={styles.screen}>
      <Image
        source={STATE_QUEEN_BACKGROUND}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition="top"
        cachePolicy="memory-disk"
      />

      <View
        style={[
          styles.listPanel,
          {
            top: listPanelTop,
            paddingHorizontal: LIST_HORIZONTAL_PAD,
            paddingBottom: footerHeight,
          },
        ]}
      >
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.gold}
              colors={[Colors.gold]}
            />
          }
          ListEmptyComponent={
            !hostsQuery.isLoading ? (
              <Text style={styles.empty}>No ranked hosts in this state yet</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <RankingFrameRow
              entry={item}
              displayW={rowDisplayW}
              variant="stateQueen"
              rewardAmount={rewardForHostRank(poolReward, item.rank)}
            />
          )}
        />
      </View>

      <View style={[styles.heroOverlay, { paddingTop: insets.top }]} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={Colors.textInverse} />
          </TouchableOpacity>
          {stateRank != null ? (
            <View style={styles.rankBadge}>
              <Text style={styles.rankBadgeText} allowFontScaling={false}>
                NO. {stateRank}
              </Text>
            </View>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>

        <View style={[styles.titleBlock, { top: stateNameTop - insets.top }]}>
          <Text style={styles.stateName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
            {stateName}
          </Text>
          <RankingCountdownBoxes countdown={countdown} />
        </View>
      </View>

      {showFooter ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <Text style={styles.footerText}>
            My rank — {myRank.rank}
            {myRank.score != null ? ` · ${formatNum(myRank.score)} gifts` : ''}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SCREEN_BG,
  },
  listPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  listContent: {
    paddingTop: Spacing.xs,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    minHeight: 40,
  },
  headerSpacer: {
    width: 24,
  },
  rankBadge: {
    backgroundColor: Colors.gold,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.goldLight,
  },
  rankBadgeText: {
    color: Colors.textInverse,
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  titleBlock: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stateName: {
    color: Colors.goldLight,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  empty: {
    color: Colors.textTertiary,
    textAlign: 'center',
    padding: Spacing.xl,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(26,15,0,0.94)',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    minHeight: FOOTER_H,
    justifyContent: 'center',
  },
  footerText: {
    color: Colors.textPrimary,
    textAlign: 'center',
    fontWeight: '600',
  },
});
