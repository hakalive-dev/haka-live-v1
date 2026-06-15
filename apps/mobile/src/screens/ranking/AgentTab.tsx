import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Share,
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
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { UserAvatar } from '@components/UserAvatar';
import { RICH, CHARM } from '@screens/level/LevelScreen';
import { leaderboardApi } from '@api/leaderboard';
import { useMock } from '@api/config';
import { mockAgentCoinsRank } from '@api/mock/ranking';
import { stateRankingApi } from '@api/stateRanking';
import { queryKeys } from '@api/queryKeys';
import { Colors, Spacing, Radius } from '@/theme';
import { RankingSkeleton } from '@components/Skeleton';
import type { LeaderboardUserEntry } from '@/types';
import type { RootStackParamList } from '@navigation/types';
import type { RootState } from '@store/index';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type MainTab = 'state' | 'agent' | 'game' | 'creator';

const MAIN_TABS: { key: MainTab; label: string }[] = [
  { key: 'state', label: 'State' },
  { key: 'agent', label: 'Agent' },
  { key: 'game', label: 'Game' },
  { key: 'creator', label: 'Activity' },
];

const AGENT_BACKGROUND = require('../../../assets/ranking/agent-background.png');
const AGENT_BG_W = 402;
const AGENT_BG_H = 898;
const AGENT_HEADER_VISIBLE_RATIO = 0.28;

const ROW_NATIVE_W = 350;
const ROW_NATIVE_H = 78;

const AGENT_ROWS = {
  1: require('../../../assets/ranking/agent/row-1st.png'),
  2: require('../../../assets/ranking/agent/row-2nd.png'),
  3: require('../../../assets/ranking/agent/row-3rd.png'),
} as const;

const AGENT_ROW_4TH = require('../../../assets/ranking/agent/row-4th-bg.png');

const PROFILE_FRAMES = {
  1: require('../../../assets/ranking/agent/profile-frame-1st.png'),
  2: require('../../../assets/ranking/agent/profile-frame-2nd.png'),
  3: require('../../../assets/ranking/agent/profile-frame-3rd.png'),
} as const;

const COIN_ICON = require('../../../assets/ranking/coin.png');
const BEAN_ICON = require('../../../assets/bean.png');
const LEVEL_CARD_BG = require('../../../assets/ranking/agent/level-card.png');
const LEVEL_STAR = require('../../../assets/ranking/agent/level-star.png');
const MAX_BADGE = require('../../../assets/ranking/agent/max-badge.png');
const INCOME_BUTTON = require('../../../assets/ranking/agent/income-button.png');

const LEVEL_CARD_NATIVE = { w: 190, h: 67 };
const LEVEL_STAR_NATIVE = { w: 19, h: 20 };
const MAX_BADGE_NATIVE = { w: 27, h: 16 };
const INCOME_BTN_NATIVE = { w: 97, h: 29 };

const AGENT_BG_COLOR = '#0D1119';
const AGENT_PROGRESS_MAX = 999_999_999;
const REWARD_VALUE_COLOR = '#C5E866';

function formatNum(n: number): string {
  return n.toLocaleString();
}

function rowHeight(displayW: number): number {
  return Math.round((ROW_NATIVE_H / ROW_NATIVE_W) * displayW);
}

const PROFILE_FRAME_NATIVE = {
  1: { w: 62, h: 66 },
  2: { w: 62, h: 71 },
  3: { w: 60, h: 67 },
} as const;

/**
 * Top-3 avatar layout at 1x — derived from frame PNG ring geometry.
 * The opening is wider than it is tall; center the circle on the side width
 * and align its top to the inner ring top so there is no gap or overflow above.
 */
const PROFILE_FRAME_AVATAR = {
  1: { d: 46, offsetX: 0, offsetY: 1.0 },
  2: { d: 46, offsetX: 0, offsetY: 0.5 },
  3: { d: 45, offsetX: 0, offsetY: 1.0 },
} as const;

/** User-face diameter for rank 4+ — matches 1st-place top-3 photo (no decorative frame). */
function rowFaceSize(displayW: number): number {
  const rowScale = displayW / ROW_NATIVE_W;
  return Math.round(PROFILE_FRAME_AVATAR[1].d * rowScale);
}

/** Left zone width — matches baked rank badge area on top-3 row PNGs. */
function rankZoneWidth(displayW: number): number {
  return Math.round(displayW * 0.115);
}

function avatarMetrics(entry: LeaderboardUserEntry, displayW: number) {
  const isTop3 = entry.rank >= 1 && entry.rank <= 3;
  const rowScale = displayW / ROW_NATIVE_W;

  if (isTop3) {
    const rank = entry.rank as 1 | 2 | 3;
    const native = PROFILE_FRAME_NATIVE[rank];
    const layout = PROFILE_FRAME_AVATAR[rank];
    const frameW = Math.round(native.w * rowScale);
    const frameH = Math.round(native.h * rowScale);
    const avatarSize = Math.round(frameW * (layout.d / native.w));
    return {
      isTop3: true,
      avatarSize,
      avatarOffsetX: layout.offsetX * rowScale,
      avatarOffsetY: layout.offsetY * rowScale,
      frameW,
      frameH,
      frameSource: PROFILE_FRAMES[rank],
    };
  }

  const faceSize = rowFaceSize(displayW);
  return {
    isTop3: false,
    avatarSize: faceSize,
    avatarOffsetX: 0,
    avatarOffsetY: 0,
    frameW: faceSize,
    frameH: faceSize,
    frameSource: null as null,
  };
}

function AgentRankRow({ entry, displayW }: { entry: LeaderboardUserEntry; displayW: number }) {
  const displayH = rowHeight(displayW);
  const metrics = avatarMetrics(entry, displayW);
  const { isTop3, avatarSize, avatarOffsetX, avatarOffsetY, frameW, frameH, frameSource } = metrics;
  const rankZoneW = rankZoneWidth(displayW);
  const rowSource = isTop3 ? AGENT_ROWS[entry.rank as 1 | 2 | 3] : AGENT_ROW_4TH;
  const bonusReward = Math.max(1, Math.floor(entry.score / 50_000));

  return (
    <View style={{ width: displayW, height: displayH, marginBottom: Spacing.sm, overflow: 'visible' }}>
      <Image
        source={rowSource}
        style={{ width: displayW, height: displayH }}
        contentFit="contain"
        cachePolicy="memory-disk"
      />
      <View style={styles.rowOverlay}>
        <View style={[styles.rankZone, { width: rankZoneW }]}>
          {!isTop3 ? (
            <Text style={styles.rankInside} allowFontScaling={false}>
              {entry.rank}
            </Text>
          ) : null}
        </View>

        <View style={[styles.avatarSlot, { width: frameW, height: frameH }]}>
          <View
            style={[
              styles.avatarInFrame,
              {
                width: avatarSize,
                height: avatarSize,
                borderRadius: avatarSize / 2,
                left: (frameW - avatarSize) / 2 + avatarOffsetX,
                top: (frameH - avatarSize) / 2 + avatarOffsetY,
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
              hideFrame
            />
          </View>
          {frameSource ? (
            <Image
              source={frameSource}
              pointerEvents="none"
              style={styles.avatarFrameOverlay}
              contentFit="fill"
              cachePolicy="memory-disk"
            />
          ) : null}
        </View>

        <View style={styles.rowInfo}>
          <Text style={[styles.rowName, !isTop3 && styles.rowNameBelow4]} numberOfLines={1}>
            {entry.displayName}
          </Text>
          <View style={styles.badgeRow}>
            {entry.richLevel != null && entry.richLevel > 0 ? (
              <Image
                source={RICH[Math.min(Math.max(entry.richLevel, 1), 100)] ?? RICH[1]}
                style={styles.levelBadgeImg}
                contentFit="contain"
              />
            ) : null}
            {entry.charmLevel != null && entry.charmLevel > 0 ? (
              <Image
                source={CHARM[Math.min(Math.max(entry.charmLevel, 0), 100)] ?? CHARM[0]}
                style={styles.levelBadgeImg}
                contentFit="contain"
              />
            ) : null}
          </View>
          <View style={styles.rewardRow}>
            <Text style={[styles.rewardLabel, !isTop3 && styles.rewardLabelBelow4]}>Reward: </Text>
            <Image source={COIN_ICON} style={styles.rowIconSm} contentFit="contain" />
            <Text style={styles.rewardValue}>{formatNum(Math.floor(entry.score * 0.08))}</Text>
            <Image source={BEAN_ICON} style={styles.rowIconSm} contentFit="contain" />
            <Text style={styles.rewardValue}>{formatNum(bonusReward)}</Text>
          </View>
        </View>

        <View style={styles.rowRight}>
          <View style={styles.coinScoreRow}>
            <Image source={COIN_ICON} style={styles.rowIconMd} contentFit="contain" />
            <Text
              style={[styles.coinScore, !isTop3 && styles.coinScoreBelow4]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.65}
            >
              {formatNum(entry.score)}
            </Text>
          </View>
          <View style={[styles.receivedPill, !isTop3 && styles.receivedPillBelow4]}>
            <Text style={[styles.receivedText, !isTop3 && styles.receivedTextBelow4]}>
              {isTop3 ? 'Unreceived' : 'Received'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

type Props = {
  navigation: Nav;
  onTabChange: (tab: MainTab) => void;
};

export function AgentTab({ navigation, onTabChange }: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const user = useSelector((s: RootState) => s.auth.user);

  const rowDisplayW = screenWidth - Spacing.md * 2;
  const designScale = screenWidth / AGENT_BG_W;
  const levelCardW = Math.round(LEVEL_CARD_NATIVE.w * designScale);
  const levelCardH = Math.round(LEVEL_CARD_NATIVE.h * designScale);
  const levelCardScale = levelCardW / LEVEL_CARD_NATIVE.w;
  const levelStarW = Math.round(LEVEL_STAR_NATIVE.w * levelCardScale);
  const levelStarH = Math.round(LEVEL_STAR_NATIVE.h * levelCardScale);
  const maxBadgeW = Math.round(MAX_BADGE_NATIVE.w * levelCardScale);
  const maxBadgeH = Math.round(MAX_BADGE_NATIVE.h * levelCardScale);
  const incomeBtnW = Math.round(INCOME_BTN_NATIVE.w * designScale);
  const incomeBtnH = Math.round(INCOME_BTN_NATIVE.h * designScale);
  const headerHeight = Math.round(screenWidth * (AGENT_BG_H / AGENT_BG_W) * AGENT_HEADER_VISIBLE_RATIO);

  const [dayLabel, setDayLabel] = useState<'Today' | 'Yesterday'>('Yesterday');
  const [selectedStateCode, setSelectedStateCode] = useState<string | null>(null);
  const [statePickerOpen, setStatePickerOpen] = useState(false);

  const statesQuery = useQuery({
    queryKey: ['stateRanking', 'states', 'agent-filter'],
    queryFn: () => stateRankingApi.getStates(),
    staleTime: 5 * 60_000,
  });

  const topStates = useMemo(
    () => statesQuery.data?.items ?? [],
    [statesQuery.data?.items],
  );

  useEffect(() => {
    if (topStates.length === 0) return;
    setSelectedStateCode((current) => {
      if (current && topStates.some((row) => row.stateCode === current)) return current;
      const userState = user?.state?.trim().toUpperCase();
      const match = userState ? topStates.find((row) => row.stateCode === userState) : undefined;
      return match?.stateCode ?? topStates[0]!.stateCode;
    });
  }, [topStates, user?.state]);

  const selectedState = topStates.find((row) => row.stateCode === selectedStateCode);
  const regionLabel = selectedState?.stateName ?? topStates[0]?.stateName ?? 'State';

  const rankingQuery = useQuery({
    queryKey: queryKeys.ranking.list({ mainTab: 'agent', period: 'daily', stateCode: selectedStateCode }),
    queryFn: () => leaderboardApi.getAgentCoinsRank(selectedStateCode ?? undefined),
    enabled: !!selectedStateCode,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const apiData = rankingQuery.data ?? [];
  const data = useMemo(() => {
    if (apiData.length > 0) return apiData;
    const useFixture = useMock;
    if (!useFixture) return [];
    const normalized = selectedStateCode?.trim().toUpperCase();
    const filtered = normalized
      ? mockAgentCoinsRank.filter((row) => row.stateCode === normalized)
      : mockAgentCoinsRank;
    return filtered.map((row, index) => ({ ...row, rank: index + 1 }));
  }, [apiData, selectedStateCode]);
  const loading = (!selectedStateCode || data.length === 0) && rankingQuery.isLoading;
  const [refreshing, setRefreshing] = useState(false);

  const myEntry = useMemo(
    () => (user?.id ? data.find((row) => row.id === user.id) : undefined),
    [data, user?.id],
  );

  const topScore = data[0]?.score ?? 0;
  const myScore = myEntry?.score ?? 0;
  const progressPct = Math.min(
    99,
    Math.max(0, Math.floor((myScore / AGENT_PROGRESS_MAX) * 100)),
  );
  const maxReward = topScore > 0 ? topScore : 2_000_000;
  const stars = myScore >= topScore * 0.8 && topScore > 0 ? 5 : Math.min(5, Math.max(1, Math.ceil(progressPct / 20)));

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
  const footerHeight = showDistanceFooter ? 52 + insets.bottom : insets.bottom + Spacing.xxxl;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([rankingQuery.refetch(), statesQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [rankingQuery, statesQuery]);

  const onShare = useCallback(async () => {
    try {
      await Share.share({ message: `Agent coin seller rankings — top score ${formatNum(topScore)}` });
    } catch {
      /* ignore */
    }
  }, [topScore]);

  const listHeader = useMemo(
    () => (
      <View>
        <View style={[styles.banner, { height: headerHeight + insets.top, paddingTop: insets.top }]}>
          <View style={styles.bannerInner}>
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
                <Ionicons name="chevron-back" size={24} color={Colors.textInverse} />
              </TouchableOpacity>
              <View style={styles.mainTabRow}>
                {MAIN_TABS.map((tab) => (
                  <TouchableOpacity
                    key={tab.key}
                    onPress={() => onTabChange(tab.key)}
                    style={[styles.mainTabItem, tab.key === 'agent' && styles.mainTabItemActive]}
                  >
                    <Text style={[styles.mainTabText, tab.key === 'agent' && styles.mainTabTextActive]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity hitSlop={8}>
                <Ionicons name="help-circle-outline" size={22} color={Colors.textInverse} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity hitSlop={8} style={styles.shareBtnFloating} onPress={onShare}>
              <Ionicons name="share-outline" size={14} color={Colors.textInverse} />
              <Text style={styles.shareBtnText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.heroSection}>
          <View style={styles.progressBlock}>
            <TouchableOpacity
              style={styles.incomeBtnWrap}
              activeOpacity={0.85}
              onPress={() => {
                if (user?.role === 'agent' || user?.role === 'payroll_agent') {
                  navigation.navigate('AgencyCenter');
                }
              }}
            >
              <Image
                source={INCOME_BUTTON}
                style={{ width: incomeBtnW, height: incomeBtnH }}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
            </TouchableOpacity>

            <View style={[styles.levelCardCenter, { marginBottom: -(levelCardH * 0.45) }]}>
              <View style={[styles.levelCardWrap, { width: levelCardW, height: levelCardH }]}>
                <Image
                  source={LEVEL_CARD_BG}
                  style={StyleSheet.absoluteFill}
                  contentFit="fill"
                  cachePolicy="memory-disk"
                />
                <View style={styles.levelCardContent}>
                  <View style={styles.levelRow}>
                    <Text style={styles.levelCardText}>Level: </Text>
                    {Array.from({ length: stars }).map((_, i) => (
                      <Image
                        key={i}
                        source={LEVEL_STAR}
                        style={{ width: levelStarW, height: levelStarH }}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                      />
                    ))}
                    {stars >= 5 ? (
                      <Image
                        source={MAX_BADGE}
                        style={{ width: maxBadgeW, height: maxBadgeH, marginLeft: 2 }}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                      />
                    ) : null}
                  </View>
                  <View style={styles.rewardLine}>
                    <Text style={styles.levelCardText}>Reward: </Text>
                    <Image source={COIN_ICON} style={styles.levelCoinIcon} contentFit="contain" />
                    <Text style={styles.levelRewardValue}>{formatNum(maxReward)}</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={[styles.progressCard, { paddingTop: levelCardH * 0.6 + Spacing.md }]}>
              <View style={styles.progressNums}>
                <Text
                  style={[styles.progressNum, styles.progressNumLeft]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {formatNum(myScore)}
                </Text>
                <Text
                  style={[styles.progressNum, styles.progressNumRight]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {formatNum(AGENT_PROGRESS_MAX)}
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <LinearGradient
                  colors={['#FFB021', '#F6C875']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[styles.progressFill, { width: `${Math.max(progressPct, 4)}%` }]}
                >
                  <Text style={styles.progressPct}>{progressPct}%</Text>
                </LinearGradient>
              </View>
              <TouchableOpacity style={styles.progressHelp}>
                <Text style={styles.progressHelpText}>?</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.filterRow}>
            <TouchableOpacity style={styles.regionPill} onPress={() => setStatePickerOpen(true)}>
              <Image source={COIN_ICON} style={styles.filterCoin} contentFit="contain" />
              <Text style={styles.filterText}>{regionLabel}</Text>
              <Ionicons name="chevron-down" size={14} color="#FFD700" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dayPill}
              onPress={() => setDayLabel((d) => (d === 'Today' ? 'Yesterday' : 'Today'))}
            >
              <Ionicons name="swap-horizontal-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.filterText}>{dayLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    ),
    [
      dayLabel,
      headerHeight,
      incomeBtnH,
      incomeBtnW,
      insets.top,
      levelCardH,
      levelCardW,
      levelStarH,
      levelStarW,
      maxBadgeH,
      maxBadgeW,
      maxReward,
      myScore,
      navigation,
      onShare,
      onTabChange,
      progressPct,
      regionLabel,
      selectedStateCode,
      stars,
      topScore,
      user?.role,
    ],
  );

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Image source={AGENT_BACKGROUND} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" />
        <RankingSkeleton rows={6} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Image
        source={AGENT_BACKGROUND}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition="top"
        cachePolicy="memory-disk"
      />

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        showsVerticalScrollIndicator={false}
        style={styles.list}
        contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingBottom: footerHeight }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FFD700" colors={['#FFD700']} />
        }
        renderItem={({ item }) => <AgentRankRow entry={item} displayW={rowDisplayW} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="trophy-outline" size={48} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>No rankings yet</Text>
          </View>
        }
      />

      {showDistanceFooter ? (
        <View style={[styles.distanceFooter, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <Text style={styles.distanceFooterLabel}>Distance from rank is: </Text>
          <Image source={COIN_ICON} style={styles.distanceFooterIcon} contentFit="contain" />
          <Text style={styles.distanceFooterValue}>{formatNum(distanceFromRankAbove)}</Text>
        </View>
      ) : null}

      <Modal visible={statePickerOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setStatePickerOpen(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Top states</Text>
            {topStates.map((row) => {
              const isActive = row.stateCode === selectedStateCode;
              return (
                <TouchableOpacity
                  key={row.stateCode}
                  style={[styles.modalOption, isActive && styles.modalOptionActive]}
                  onPress={() => {
                    setSelectedStateCode(row.stateCode);
                    setStatePickerOpen(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, isActive && styles.modalOptionTextActive]}>
                    #{row.rank} {row.stateName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AGENT_BG_COLOR },
  list: { backgroundColor: 'transparent' },
  banner: {
    width: '100%',
    paddingHorizontal: Spacing.md,
    overflow: 'hidden',
  },
  bannerInner: {
    flex: 1,
    position: 'relative',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  shareBtnFloating: {
    position: 'absolute',
    top: 36,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  shareBtnText: { color: Colors.textInverse, fontSize: 12, fontWeight: '600' },
  mainTabRow: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(60,60,60,0.55)',
    borderRadius: Radius.full,
    padding: 3,
  },
  mainTabItem: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: Radius.full },
  mainTabItemActive: { backgroundColor: '#FFFFFF' },
  mainTabText: { fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.8)' },
  mainTabTextActive: { color: '#D4880A', fontWeight: '700' },
  heroSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: 0,
    marginTop: -(Spacing.xxxl + Spacing.md),
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  progressBlock: {
    width: '100%',
    alignItems: 'center',
    marginTop: -Spacing.md,
  },
  incomeBtnWrap: {
    alignSelf: 'center',
    marginTop: -Spacing.lg,
    marginBottom: Spacing.md,
  },
  levelCardCenter: {
    alignSelf: 'center',
    zIndex: 2,
  },
  levelCardWrap: {
    position: 'relative',
    overflow: 'hidden',
  },
  levelCardContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    gap: 3,
  },
  levelCardText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  levelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 1 },
  rewardLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  levelCoinIcon: { width: 14, height: 14 },
  levelRewardValue: { color: Colors.gold, fontSize: 13, fontWeight: '700' },
  progressCard: {
    width: '100%',
    backgroundColor: 'rgba(30,35,50,0.85)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#3A5080',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  progressNums: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    zIndex: 1,
  },
  progressNum: {
    color: Colors.textInverse,
    fontSize: 13,
    fontWeight: '600',
  },
  progressNumLeft: { flex: 1, textAlign: 'left' },
  progressNumRight: { flex: 1, textAlign: 'right' },
  progressTrack: {
    height: 22,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.45)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 36,
  },
  progressPct: { color: '#2A1A0F', fontSize: 11, fontWeight: '800' },
  progressHelp: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressHelpText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  regionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  dayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  filterCoin: { width: 16, height: 16 },
  filterText: { color: Colors.textInverse, fontSize: 13, fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  modalCard: {
    backgroundColor: 'rgba(30,35,50,0.98)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#3A5080',
    padding: Spacing.lg,
    gap: Spacing.xs,
    maxHeight: '70%',
  },
  modalTitle: {
    color: Colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  modalOption: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
  },
  modalOptionActive: {
    backgroundColor: Colors.primarySubtle,
  },
  modalOptionText: {
    color: Colors.textInverse,
    fontSize: 14,
    fontWeight: '500',
  },
  modalOptionTextActive: {
    color: Colors.primaryLight,
    fontWeight: '700',
  },
  rankInside: {
    fontWeight: '800',
    color: '#FFFFFF',
    fontSize: 17,
    textAlign: 'center',
  },
  rowOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: '3%',
    paddingVertical: 4,
    gap: 4,
  },
  rankZone: {
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  avatarSlot: {
    position: 'relative',
    marginLeft: -2,
    overflow: 'visible',
  },
  avatarInFrame: {
    position: 'absolute',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFrameOverlay: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  rowInfo: { flex: 1, gap: 1, minWidth: 0 },
  rowName: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  rowNameBelow4: { color: '#FFFFFF' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  levelBadgeImg: { width: 44, height: 16 },
  rewardRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 2 },
  rewardLabel: { color: '#FFFFFF', fontSize: 10, fontWeight: '500' },
  rewardLabelBelow4: { color: '#FFFFFF' },
  rewardValue: { color: REWARD_VALUE_COLOR, fontSize: 10, fontWeight: '700' },
  rowIconSm: { width: 12, height: 12 },
  rowIconMd: { width: 18, height: 18 },
  rowRight: { alignItems: 'flex-end', justifyContent: 'center', gap: 4, maxWidth: '34%' },
  coinScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  coinScore: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', maxWidth: 100 },
  coinScoreBelow4: { color: '#2A1A0F' },
  receivedPill: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  receivedPillBelow4: {
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  receivedText: { color: '#F24822', fontSize: 10, fontWeight: '700' },
  receivedTextBelow4: { color: '#FFFFFF' },
  emptyWrap: { alignItems: 'center', paddingTop: Spacing.xxxl, gap: Spacing.md },
  emptyText: { color: Colors.textSecondary, fontSize: 15 },
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
    paddingHorizontal: Spacing.lg,
    minHeight: 48,
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
