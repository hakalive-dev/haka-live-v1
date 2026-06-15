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
import * as Location from 'expo-location';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { UserAvatar } from '@components/UserAvatar';
import { stateRankingApi, type StateRankingRow } from '@api/stateRanking';
import { STATE_RANKING_COUNTRIES } from '@haka-live/shared-types/state-rankings';
import { Colors, Spacing, Radius } from '@/theme';
import type { RootStackParamList } from '@navigation/types';
import type { RootState } from '@store/index';

import { StateRankingPrizeDetailsModal } from './StateRankingPrizeDetailsModal';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type MainTab = 'state' | 'agent' | 'game' | 'creator';

const MAIN_TABS: { key: MainTab; label: string }[] = [
  { key: 'state', label: 'State' },
  { key: 'agent', label: 'Agent' },
  { key: 'game', label: 'Game' },
  { key: 'creator', label: 'Activity' },
];

const BEAN_ICON = require('../../../assets/bean.png');
const COIN_ICON = require('../../../assets/ranking/coin.png');
const TIMER_STRIP = require('../../../assets/ranking/state-star/timer-box.png');
const STATE_QUEEN_BADGE = require('../../../assets/ranking/state-star/state-queen.png');
const TODAY_BUTTON = require('../../../assets/ranking/state-star/today-button.png');

/** Native dimensions of `timer-box.png` (full Hour : Min : Sec strip). */
const TIMER_NATIVE_W = 169;
const TIMER_NATIVE_H = 47;
const TIMER_BOX_W = 43;
const TIMER_GAP_W = 18;
const TIMER_EDGE_PAD = 2;
const TIMER_DIGIT_H = 32;
/** Logical width — matches 1x asset; `@3x` PNG keeps digits crisp on retina. */
const COUNTDOWN_DISPLAY_W = 168;
const COUNTDOWN_SCALE = COUNTDOWN_DISPLAY_W / TIMER_NATIVE_W;

/** Native dimensions of `state-queen.png` badge asset. */
const STATE_QUEEN_NATIVE_W = 118;
const STATE_QUEEN_NATIVE_H = 52;
const STATE_QUEEN_DISPLAY_W = 118;
const STATE_QUEEN_DISPLAY_H = Math.round(
  (STATE_QUEEN_NATIVE_H / STATE_QUEEN_NATIVE_W) * STATE_QUEEN_DISPLAY_W,
);

/** Native dimensions of `today-button.png` pill asset. */
const TODAY_NATIVE_W = 238;
const TODAY_NATIVE_H = 47;

const PODIUM_FRAMES = {
  first: {
    source: require('../../../assets/ranking/state-star/podiums/podium-1st.png'),
    nativeW: 120,
    nativeH: 190,
    displayW: 118,
    layout: { paddingTopPct: 0.27, stateFontSize: 13, avatarSize: 24, scoreFontSize: 10 },
  },
  second: {
    source: require('../../../assets/ranking/state-star/podiums/podium-2nd.png'),
    nativeW: 123,
    nativeH: 190,
    displayW: 115,
    layout: { paddingTopPct: 0.29, stateFontSize: 11, avatarSize: 20, scoreFontSize: 9 },
  },
  third: {
    source: require('../../../assets/ranking/state-star/podiums/podium-3rd.png'),
    nativeW: 120,
    nativeH: 191,
    displayW: 115,
    layout: { paddingTopPct: 0.29, stateFontSize: 11, avatarSize: 20, scoreFontSize: 9 },
  },
} as const;

function podiumDisplayHeight(variant: keyof typeof PODIUM_FRAMES): number {
  const frame = PODIUM_FRAMES[variant];
  return Math.round((frame.nativeH / frame.nativeW) * frame.displayW);
}

/** Native dimensions of `state-star-header.png` — keep banner height in sync with asset. */
const HEADER_IMAGE_WIDTH = 402;
const HEADER_IMAGE_HEIGHT = 898;
/** Top portion of the asset shown before rankings (through Today pill), per mockup. */
const HEADER_VISIBLE_RATIO = 0.48;

const STATE_COLORS = {
  bg: '#2D1B10',
  rowBg: '#D4B896',
  rowText: '#2A1A0F',
  gold: '#F5C842',
  podiumGold: '#FFD700',
};

function formatNum(n: number): string {
  return n.toLocaleString();
}

function CountdownBoxes({ countdown }: { countdown: string }) {
  const [hh, mm, ss] = countdown.split(':');
  const values = [hh, mm, ss];
  const stripH = Math.round(TIMER_NATIVE_H * COUNTDOWN_SCALE);
  const boxW = Math.round(TIMER_BOX_W * COUNTDOWN_SCALE);
  const gapW = Math.round(TIMER_GAP_W * COUNTDOWN_SCALE);
  const edgePad = Math.round(TIMER_EDGE_PAD * COUNTDOWN_SCALE);
  const digitH = Math.round(TIMER_DIGIT_H * COUNTDOWN_SCALE);

  return (
    <View style={[styles.countdownWrap, { width: COUNTDOWN_DISPLAY_W, height: stripH }]}>
      <Image
        source={TIMER_STRIP}
        style={{ width: COUNTDOWN_DISPLAY_W, height: stripH }}
        contentFit="contain"
        cachePolicy="memory-disk"
      />
      <View style={[styles.countdownDigitsRow, { height: digitH, paddingLeft: edgePad, top: 1 }]}>
        {values.map((val, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 ? <View style={{ width: gapW }} /> : null}
            <View style={[styles.countdownDigitCell, { width: boxW, height: digitH }]}>
              <Text style={styles.countdownNum} allowFontScaling={false}>
                {val}
              </Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

function HostAvatarsRow({
  hosts,
  size = 26,
  variant = 'default',
}: {
  hosts: StateRankingRow['topHosts'];
  size?: number;
  variant?: 'default' | 'podium' | 'list';
}) {
  if (!hosts.length) return null;
  const overlap = size <= 20 ? -6 : -8;
  const wrapStyle = variant === 'podium' ? styles.avatarWrapPodium : styles.avatarWrap;
  const rowStyle =
    variant === 'list' ? styles.avatarRowList : variant === 'podium' ? styles.avatarRow : styles.avatarRowList;
  return (
    <View style={rowStyle}>
      {hosts.slice(0, 5).map((h, i) => (
        <View
          key={h.id}
          style={[wrapStyle, { marginLeft: i > 0 ? overlap : 0, width: size, height: size }]}
        >
          <UserAvatar
            user={{ displayName: h.displayName, avatar: h.avatar, equippedFrame: null }}
            size={size}
            hideBorder
          />
        </View>
      ))}
    </View>
  );
}

function PodiumCard({
  row,
  variant,
  onPress,
}: {
  row: StateRankingRow;
  variant: 'first' | 'second' | 'third';
  onPress: () => void;
}) {
  const frame = PODIUM_FRAMES[variant];
  const displayW = frame.displayW;
  const displayH = podiumDisplayHeight(variant);
  const { paddingTopPct, stateFontSize, avatarSize, scoreFontSize } = frame.layout;
  const isFirst = variant === 'first';

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.podiumCardOuter, isFirst && styles.podiumCardOuterFirst]}
      activeOpacity={0.85}
    >
      <View style={{ width: displayW, height: displayH }}>
        <Image
          source={frame.source}
          style={{ width: displayW, height: displayH }}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
        <View
          style={[
            styles.podiumOverlay,
            {
              paddingTop: Math.round(displayH * paddingTopPct),
              paddingBottom: Math.round(displayH * 0.11),
            },
          ]}
          pointerEvents="none"
        >
          <Text
            style={[styles.podiumStateName, { fontSize: stateFontSize }]}
            numberOfLines={1}
            allowFontScaling={false}
          >
            {row.stateName}
          </Text>

          <View style={styles.podiumMiddle}>
            <HostAvatarsRow hosts={row.topHosts} size={avatarSize} variant="podium" />
          </View>

          <View style={styles.podiumBottom}>
            <Text
              style={[styles.podiumScore, { fontSize: scoreFontSize }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              allowFontScaling={false}
            >
              {formatNum(row.totalGiftScore)}
            </Text>

            <View style={styles.podiumRewardPill}>
              <Image source={BEAN_ICON} style={styles.podiumRewardIcon} contentFit="contain" />
              <Text
                style={styles.podiumReward}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
                allowFontScaling={false}
              >
                {formatNum(row.poolReward)}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function StateListRow({ row, variant = 'list' }: { row: StateRankingRow; variant?: 'list' | 'footer' }) {
  const isFooter = variant === 'footer';
  const rankLabel = row.rank > 0 ? String(row.rank) : '--';

  return (
    <View style={[styles.listRow, isFooter && styles.footerRow]}>
      <Text style={[styles.listRank, isFooter && styles.footerRank]} allowFontScaling={false}>
        {rankLabel}
      </Text>
      <View style={styles.listMain}>
        <Text style={[styles.listStateName, isFooter && styles.footerStateName]} numberOfLines={1}>
          {row.stateName}
        </Text>
        <View style={styles.listAvatarRow}>
          <HostAvatarsRow hosts={row.topHosts} size={22} variant="list" />
          <View style={styles.avatarCoinRow}>
            <Image source={COIN_ICON} style={styles.iconSm} contentFit="contain" />
            <Text style={[styles.listReward, isFooter && styles.footerReward]}>
              {formatNum(row.poolReward)}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.listRight}>
        <View style={styles.scoreRow}>
          <Image source={BEAN_ICON} style={styles.iconSm} contentFit="contain" />
          <Text style={[styles.listScore, isFooter && styles.footerScore]}>{formatNum(row.totalGiftScore)}</Text>
        </View>
      </View>
    </View>
  );
}

function MyStateFooter({ row }: { row: StateRankingRow | null }) {
  if (!row) {
    return (
      <View style={styles.footerBar}>
        <Text style={styles.footerHint}>Set your state in profile to see your ranking</Text>
      </View>
    );
  }
  return (
    <View style={styles.footerBar}>
      <StateListRow row={row} variant="footer" />
    </View>
  );
}

type Props = {
  navigation: Nav;
  onTabChange: (tab: MainTab) => void;
};

export function StateStarTab({ navigation, onTabChange }: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const user = useSelector((s: RootState) => s.auth.user);

  const bannerHeight = Math.round(
    screenWidth * (HEADER_IMAGE_HEIGHT / HEADER_IMAGE_WIDTH) * HEADER_VISIBLE_RATIO,
  );

  const inspectorQuery = useQuery({
    queryKey: ['stateRanking', 'canInspect'],
    queryFn: () => stateRankingApi.getCanInspect(),
    enabled: user?.canInspectStateRankings !== true,
    staleTime: 5 * 60_000,
  });

  const canInspect =
    user?.canInspectStateRankings === true ||
    inspectorQuery.data?.canInspectStateRankings === true;
  const faceApproved = user?.faceVerificationStatus === 'approved';

  const [countdown, setCountdown] = useState('00:00:00');
  const [prizeOpen, setPrizeOpen] = useState(false);
  const [inspectorCountry, setInspectorCountry] = useState('IN');
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [stateSuggestion, setStateSuggestion] = useState<{ code: string; name: string } | null>(
    null,
  );

  const countryCode = canInspect ? inspectorCountry : undefined;

  useEffect(() => {
    if (!user?.state?.trim() && faceApproved) {
      void (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') return;
          const loc = await Location.getCurrentPositionAsync({});
          const suggestion = await stateRankingApi.suggestState(
            loc.coords.latitude,
            loc.coords.longitude,
          );
          if (suggestion.stateCode && suggestion.stateName) {
            setStateSuggestion({ code: suggestion.stateCode, name: suggestion.stateName });
          }
        } catch {
          /* optional */
        }
      })();
    }
  }, [user?.state, faceApproved]);

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
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const statesQuery = useQuery({
    queryKey: ['stateRanking', 'states', countryCode],
    queryFn: () => stateRankingApi.getStates(countryCode ? { countryCode } : undefined),
    enabled: faceApproved || canInspect,
  });

  const summaryQuery = useQuery({
    queryKey: ['stateRanking', 'summary', countryCode],
    queryFn: () => stateRankingApi.getSummary(countryCode ? { countryCode } : undefined),
    enabled: faceApproved || canInspect,
  });

  const myStateQuery = useQuery({
    queryKey: ['stateRanking', 'myState'],
    queryFn: () => stateRankingApi.getMyState(),
    enabled: faceApproved || canInspect,
  });

  const items = statesQuery.data?.items ?? [];
  const top3 = items.slice(0, 3);
  const rest = items.slice(3);
  const second = top3.find((r) => r.rank === 2);
  const first = top3.find((r) => r.rank === 1);
  const third = top3.find((r) => r.rank === 3);

  const openStateQueen = useCallback(
    (row: StateRankingRow) => {
      navigation.navigate('StateQueen', {
        stateCode: row.stateCode,
        stateName: row.stateName,
        countryCode: canInspect ? inspectorCountry : statesQuery.data?.countryCode,
      });
    },
    [navigation, canInspect, inspectorCountry, statesQuery.data?.countryCode],
  );

  const onShare = useCallback(async () => {
    try {
      await Share.share({
        message: `State Star rankings — ${summaryQuery.data?.totalDailyPrizePool.toLocaleString() ?? 0} reward points today!`,
      });
    } catch {
      /* ignore */
    }
  }, [summaryQuery.data?.totalDailyPrizePool]);

  const faceLocked = !faceApproved && !canInspect;

  const todayDisplayW = Math.min(TODAY_NATIVE_W, Math.round(screenWidth * 0.88));
  const todayDisplayH = Math.round((TODAY_NATIVE_H / TODAY_NATIVE_W) * todayDisplayW);

  const listHeader = useMemo(
    () => (
      <View>
        <View style={[styles.banner, { height: bannerHeight + insets.top, paddingTop: insets.top }]}>
          <Image
            source={require('../../../assets/ranking/state-star/state-star-header.png')}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition="top"
          />
          <LinearGradient
            colors={['transparent', 'transparent', 'rgba(45,27,16,0.55)']}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
          />
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
                    style={[styles.mainTabItem, tab.key === 'state' && styles.mainTabItemActive]}
                  >
                    <Text style={[styles.mainTabText, tab.key === 'state' && styles.mainTabTextActive]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity onPress={() => setPrizeOpen(true)} hitSlop={8}>
                <Ionicons name="help-circle-outline" size={22} color={Colors.textInverse} />
              </TouchableOpacity>
            </View>

            {canInspect ? (
              <TouchableOpacity
                style={styles.inspectorBadgeFloating}
                onPress={() => setCountryPickerOpen(true)}
              >
                <Text style={styles.inspectorBadgeText}>Inspector</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={styles.shareBtnFloating} onPress={onShare}>
              <Ionicons name="share-outline" size={14} color={Colors.textInverse} />
              <Text style={styles.shareBtnText}>Share</Text>
            </TouchableOpacity>

            <View style={styles.bannerSpacer} />

            <View style={styles.bannerBottom}>
              <CountdownBoxes countdown={countdown} />

              <TouchableOpacity
                style={styles.stateQueenBtn}
                activeOpacity={0.85}
                onPress={() => {
                  const my = myStateQuery.data?.row;
                  if (my?.stateCode) {
                    openStateQueen(my);
                  } else {
                    navigation.navigate('EditProfile');
                  }
                }}
              >
                <Image
                  source={STATE_QUEEN_BADGE}
                  style={styles.stateQueenImage}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
              </TouchableOpacity>

              <View style={[styles.periodPillWrap, { width: todayDisplayW, height: todayDisplayH }]}>
                <Image
                  source={TODAY_BUTTON}
                  style={{ width: todayDisplayW, height: todayDisplayH }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
                <View style={styles.periodOverlay} pointerEvents="none">
                  <Text style={styles.periodToday} allowFontScaling={false}>
                    Today
                  </Text>
                  <View style={styles.scoreRow}>
                    <Image source={BEAN_ICON} style={styles.iconSm} contentFit="contain" cachePolicy="memory-disk" />
                    <Text style={styles.periodPool} allowFontScaling={false}>
                      {formatNum(summaryQuery.data?.totalDailyPrizePool ?? 0)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>

        {stateSuggestion && !user?.state?.trim() ? (
          <TouchableOpacity
            style={styles.suggestBar}
            onPress={() => navigation.navigate('EditProfile')}
          >
            <Text style={styles.suggestText}>
              Suggested state: {stateSuggestion.name} — tap to set in profile
            </Text>
          </TouchableOpacity>
        ) : null}

        {top3.length > 0 && (
          <View style={styles.podiumSection}>
            <View style={styles.podiumRow}>
              <View style={styles.podiumSide}>
                {second ? (
                  <PodiumCard row={second} variant="second" onPress={() => openStateQueen(second)} />
                ) : (
                  <View style={styles.podiumSpacer} />
                )}
              </View>
              <View style={styles.podiumCenter}>
                {first ? (
                  <PodiumCard row={first} variant="first" onPress={() => openStateQueen(first)} />
                ) : null}
              </View>
              <View style={styles.podiumSide}>
                {third ? (
                  <PodiumCard row={third} variant="third" onPress={() => openStateQueen(third)} />
                ) : (
                  <View style={styles.podiumSpacer} />
                )}
              </View>
            </View>
          </View>
        )}
      </View>
    ),
    [
      bannerHeight,
      canInspect,
      screenWidth,
      stateSuggestion,
      user?.state,
      countdown,
      first,
      insets.top,
      inspectorCountry,
      myStateQuery.data?.row,
      navigation,
      onShare,
      onTabChange,
      openStateQueen,
      second,
      summaryQuery.data?.totalDailyPrizePool,
      third,
      todayDisplayH,
      todayDisplayW,
      top3.length,
    ],
  );

  if (faceLocked) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={Colors.textInverse} />
          </TouchableOpacity>
          <Text style={styles.lockedTitle}>State Star</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.lockedBody}>
          <Ionicons name="scan-outline" size={56} color={Colors.textTertiary} />
          <Text style={styles.lockedText}>Face verification required to view state rankings</Text>
          <TouchableOpacity
            style={styles.verifyBtn}
            onPress={() => navigation.navigate('Authentication')}
          >
            <Text style={styles.verifyBtnText}>Verify now</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={rest}
        keyExtractor={(item) => item.stateCode}
        ListHeaderComponent={listHeader}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => openStateQueen(item)}
            activeOpacity={0.85}
            style={styles.listItemWrap}
          >
            <StateListRow row={item} />
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        refreshControl={
          <RefreshControl
            refreshing={statesQuery.isFetching}
            onRefresh={() => {
              void statesQuery.refetch();
              void summaryQuery.refetch();
              void myStateQuery.refetch();
            }}
            tintColor={STATE_COLORS.gold}
          />
        }
        ListEmptyComponent={
          !statesQuery.isLoading ? (
            <Text style={styles.emptyText}>No state rankings yet for your country</Text>
          ) : null
        }
      />

      <View style={[styles.footerWrap, { paddingBottom: insets.bottom }]}>
        <MyStateFooter row={myStateQuery.data?.row ?? null} />
      </View>

      <StateRankingPrizeDetailsModal visible={prizeOpen} onClose={() => setPrizeOpen(false)} />

      <Modal visible={countryPickerOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setCountryPickerOpen(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Inspector country</Text>
            {STATE_RANKING_COUNTRIES.map((c) => (
              <TouchableOpacity
                key={c.countryCode}
                style={styles.modalOption}
                onPress={() => {
                  setInspectorCountry(c.countryCode);
                  setCountryPickerOpen(false);
                }}
              >
                <Text style={styles.modalOptionText}>{c.countryName}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: STATE_COLORS.bg },
  banner: {
    width: '100%',
    paddingHorizontal: Spacing.md,
    overflow: 'hidden',
  },
  bannerInner: {
    flex: 1,
    justifyContent: 'space-between',
    position: 'relative',
  },
  bannerSpacer: { flex: 1, minHeight: Spacing.md },
  bannerBottom: {
    alignItems: 'center',
    gap: 6,
    paddingBottom: Spacing.sm,
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
  mainTabItem: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: Radius.full },
  mainTabItemActive: { backgroundColor: '#FFFFFF' },
  mainTabText: { fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.8)' },
  mainTabTextActive: { color: '#D4880A', fontWeight: '700' },
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
  inspectorBadgeFloating: {
    position: 'absolute',
    top: 36,
    left: 0,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  inspectorBadgeText: { color: Colors.textPrimary, fontSize: 10, fontWeight: '700' },
  shareBtnText: { color: Colors.textInverse, fontSize: 12, fontWeight: '600' },
  countdownWrap: {
    position: 'relative',
    alignSelf: 'center',
  },
  countdownDigitsRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  countdownDigitCell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownNum: {
    color: '#FFE566',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0,
    includeFontPadding: false,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  stateQueenBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateQueenImage: {
    width: STATE_QUEEN_DISPLAY_W,
    height: STATE_QUEEN_DISPLAY_H,
  },
  suggestBar: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.primarySubtle,
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  suggestText: { color: Colors.primaryLight, fontSize: 12, textAlign: 'center' },
  periodPillWrap: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  periodOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 6,
  },
  periodToday: { fontWeight: '800', color: STATE_COLORS.rowText, fontSize: 13 },
  periodPool: { fontWeight: '700', color: STATE_COLORS.rowText, fontSize: 10, marginTop: 1 },
  podiumSection: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  podiumRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2 },
  podiumSide: { flex: 0, paddingBottom: Spacing.xs },
  podiumCenter: { flex: 0, marginBottom: Spacing.md },
  podiumSpacer: { width: PODIUM_FRAMES.second.displayW, height: podiumDisplayHeight('second') },
  podiumCardOuter: { alignItems: 'center' },
  podiumCardOuterFirst: {},
  podiumOverlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  podiumMiddle: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
    alignItems: 'center',
    paddingVertical: 2,
  },
  podiumBottom: {
    width: '100%',
    alignItems: 'center',
    gap: 4,
  },
  podiumStateName: {
    color: '#FFE566',
    fontWeight: '800',
    textAlign: 'center',
    width: '100%',
    marginBottom: 2,
  },
  podiumScore: {
    color: '#FFE566',
    fontWeight: '800',
    textAlign: 'center',
    width: '100%',
  },
  podiumRewardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
    gap: 3,
    maxWidth: '94%',
  },
  podiumRewardIcon: { width: 12, height: 12 },
  podiumReward: { color: '#FFE566', fontSize: 9, fontWeight: '700', flexShrink: 1 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 1 },
  avatarRowList: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', marginVertical: 1 },
  avatarWrap: { borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: '#FFFFFF' },
  avatarWrapPodium: { borderRadius: 999, overflow: 'hidden', borderWidth: 1.5, borderColor: '#FFD700' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  iconSm: { width: 14, height: 14 },
  iconMd: { width: 16, height: 16 },
  listItemWrap: { paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: STATE_COLORS.rowBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#B89A72',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  footerRow: {
    backgroundColor: '#FFFFFF',
    marginBottom: 0,
    borderWidth: 0,
    borderRadius: 0,
    alignItems: 'center',
  },
  listRank: {
    width: 28,
    fontWeight: '800',
    color: STATE_COLORS.rowText,
    fontSize: 20,
    textAlign: 'center',
  },
  footerRank: { color: '#2A1A0F' },
  listMain: { flex: 1, gap: 4, alignItems: 'flex-start' },
  listAvatarRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  avatarCoinRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  listStateName: { fontWeight: '700', color: STATE_COLORS.rowText, fontSize: 14 },
  footerStateName: { color: '#2A1A0F' },
  listRight: { alignItems: 'flex-end', gap: 3 },
  listScore: { fontSize: 11, fontWeight: '700', color: STATE_COLORS.rowText },
  footerScore: { color: '#2A1A0F' },
  listReward: { fontSize: 11, fontWeight: '700', color: STATE_COLORS.rowText },
  footerReward: { color: '#B03060' },
  footerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
  },
  footerBar: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
  },
  footerHint: { color: Colors.textSecondary, textAlign: 'center', padding: Spacing.md },
  emptyText: { color: Colors.textTertiary, textAlign: 'center', padding: Spacing.xl },
  lockedTitle: { flex: 1, textAlign: 'center', color: Colors.textPrimary, fontWeight: '700' },
  lockedBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  lockedText: { color: Colors.textSecondary, textAlign: 'center' },
  verifyBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  verifyBtnText: { color: Colors.textPrimary, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  modalCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radius.lg, padding: Spacing.lg },
  modalTitle: { color: Colors.textPrimary, fontWeight: '700', marginBottom: Spacing.md },
  modalOption: { paddingVertical: Spacing.md },
  modalOptionText: { color: Colors.textPrimary },
});
