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

const GOLD_BAG = require('../../../assets/ranking/state-star/gold-bag.png');
const REWARD_ICON = require('../../../assets/ranking/state-star/reward.png');

const STATE_COLORS = {
  bg: '#2A1A0F',
  rowBg: '#C4A574',
  rowText: '#1A1208',
  gold: '#E8A020',
};

function formatNum(n: number): string {
  return n.toLocaleString();
}

function CountdownBoxes({ countdown }: { countdown: string }) {
  const [hh, mm, ss] = countdown.split(':');
  return (
    <View style={styles.countdownRow}>
      <View style={styles.countdownBox}>
        <Text style={styles.countdownNum}>{hh}</Text>
        <Text style={styles.countdownLabel}>Hour</Text>
      </View>
      <Text style={styles.countdownSep}>:</Text>
      <View style={styles.countdownBox}>
        <Text style={styles.countdownNum}>{mm}</Text>
        <Text style={styles.countdownLabel}>Min</Text>
      </View>
      <Text style={styles.countdownSep}>:</Text>
      <View style={styles.countdownBox}>
        <Text style={styles.countdownNum}>{ss}</Text>
        <Text style={styles.countdownLabel}>Sec</Text>
      </View>
    </View>
  );
}

function HostAvatarsRow({ hosts }: { hosts: StateRankingRow['topHosts'] }) {
  if (!hosts.length) return null;
  return (
    <View style={styles.avatarRow}>
      {hosts.slice(0, 5).map((h) => (
        <View key={h.id} style={styles.avatarWrap}>
          <UserAvatar
            user={{ displayName: h.displayName, avatar: h.avatar, equippedFrame: null }}
            size={28}
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
  const crownColor =
    variant === 'first' ? '#FFD700' : variant === 'second' ? '#C0C0C0' : '#CD7F32';
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.podiumCard, variant === 'first' && styles.podiumCardFirst]}
      activeOpacity={0.85}
    >
      <Ionicons name="trophy" size={18} color={crownColor} />
      <Text style={styles.podiumStateName} numberOfLines={1}>
        {row.stateName}
      </Text>
      <HostAvatarsRow hosts={row.topHosts} />
      <View style={styles.scoreRow}>
        <Image source={GOLD_BAG} style={styles.iconSm} />
        <Text style={styles.podiumScore}>{formatNum(row.totalGiftScore)}</Text>
      </View>
      <View style={styles.scoreRow}>
        <Image source={REWARD_ICON} style={styles.iconSm} />
        <Text style={styles.podiumReward}>{formatNum(row.poolReward)}</Text>
      </View>
    </TouchableOpacity>
  );
}

function StateListRow({ row }: { row: StateRankingRow }) {
  return (
    <View style={styles.listRow}>
      <Text style={styles.listRank}>{row.rank}</Text>
      <Text style={styles.listStateName} numberOfLines={1}>
        {row.stateName}
      </Text>
      <View style={styles.listRight}>
        <View style={styles.scoreRow}>
          <Image source={GOLD_BAG} style={styles.iconSm} />
          <Text style={styles.listScore}>{formatNum(row.totalGiftScore)}</Text>
        </View>
        <View style={styles.scoreRow}>
          <Image source={REWARD_ICON} style={styles.iconSm} />
          <Text style={styles.listReward}>{formatNum(row.poolReward)}</Text>
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
    <View style={[styles.listRow, styles.footerBar]}>
      <Text style={styles.listRank}>{row.rank > 0 ? row.rank : '--'}</Text>
      <Text style={styles.listStateName} numberOfLines={1}>
        {row.stateName}
      </Text>
      <View style={styles.listRight}>
        <View style={styles.scoreRow}>
          <Image source={GOLD_BAG} style={styles.iconSm} />
          <Text style={styles.listScore}>{formatNum(row.totalGiftScore)}</Text>
        </View>
        <View style={styles.scoreRow}>
          <Image source={REWARD_ICON} style={styles.iconSm} />
          <Text style={styles.listReward}>{formatNum(row.poolReward)}</Text>
        </View>
      </View>
    </View>
  );
}

type Props = {
  navigation: Nav;
  onTabChange: (tab: MainTab) => void;
};

export function StateStarTab({ navigation, onTabChange }: Props) {
  const insets = useSafeAreaInsets();
  const user = useSelector((s: RootState) => s.auth.user);

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

  const listHeader = useMemo(
    () => (
      <View>
        <View style={[styles.banner, { paddingTop: insets.top }]}>
          <Image
            source={require('../../../assets/ranking/state-star/state-star-header.png')}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0.15)', 'transparent']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
              <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
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
              <Ionicons name="help-circle-outline" size={22} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.shareRow}>
            {canInspect ? (
              <View style={styles.inspectorBadge}>
                <Text style={styles.inspectorBadgeText}>Inspector</Text>
              </View>
            ) : null}
            <TouchableOpacity style={styles.shareBtn} onPress={onShare}>
              <Text style={styles.shareBtnText}>Share</Text>
            </TouchableOpacity>
          </View>

          <CountdownBoxes countdown={countdown} />

          <TouchableOpacity
            style={styles.stateQueenBtn}
            onPress={() => {
              const my = myStateQuery.data?.row;
              if (my?.stateCode) {
                openStateQueen(my);
              } else {
                navigation.navigate('EditProfile');
              }
            }}
          >
            <Text style={styles.stateQueenText}>State Queen</Text>
          </TouchableOpacity>

          {canInspect && (
            <TouchableOpacity style={styles.inspectorPill} onPress={() => setCountryPickerOpen(true)}>
              <Text style={styles.inspectorText}>Inspector · {inspectorCountry}</Text>
            </TouchableOpacity>
          )}
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

        <LinearGradient colors={['#F5C842', '#E8A020']} style={styles.periodPill}>
          <Ionicons name="chevron-back" size={18} color={STATE_COLORS.rowText} />
          <View style={styles.periodCenter}>
            <Text style={styles.periodToday}>Today</Text>
            <View style={styles.scoreRow}>
              <Image source={REWARD_ICON} style={styles.iconSm} />
              <Text style={styles.periodPool}>
                {formatNum(summaryQuery.data?.totalDailyPrizePool ?? 0)}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={STATE_COLORS.rowText} />
        </LinearGradient>

        {top3.length > 0 && (
          <View style={styles.podiumRow}>
            <View style={styles.podiumSide}>{second ? <PodiumCard row={second} variant="second" onPress={() => openStateQueen(second)} /> : <View style={styles.podiumSpacer} />}</View>
            <View style={styles.podiumCenter}>{first ? <PodiumCard row={first} variant="first" onPress={() => openStateQueen(first)} /> : null}</View>
            <View style={styles.podiumSide}>{third ? <PodiumCard row={third} variant="third" onPress={() => openStateQueen(third)} /> : <View style={styles.podiumSpacer} />}</View>
          </View>
        )}
      </View>
    ),
    [
      canInspect,
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
      top3.length,
    ],
  );

  if (faceLocked) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
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
          <TouchableOpacity onPress={() => openStateQueen(item)} activeOpacity={0.85}>
            <StateListRow row={item} />
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + 88, paddingHorizontal: Spacing.md }}
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
  banner: { minHeight: 280, paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  mainTabRow: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(120,120,120,0.45)',
    borderRadius: Radius.full,
    padding: 3,
  },
  mainTabItem: { flex: 1, paddingVertical: 5, alignItems: 'center', borderRadius: Radius.full },
  mainTabItemActive: { backgroundColor: '#FFFFFF' },
  mainTabText: { fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.75)' },
  mainTabTextActive: { color: STATE_COLORS.gold, fontWeight: '700' },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  inspectorBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  inspectorBadgeText: { color: Colors.textPrimary, fontSize: 10, fontWeight: '700' },
  shareBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  shareBtnText: { color: Colors.textPrimary, fontSize: 12, fontWeight: '600' },
  countdownRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 },
  countdownBox: {
    backgroundColor: 'rgba(232,160,32,0.35)',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    alignItems: 'center',
    minWidth: 52,
  },
  countdownNum: { color: Colors.textPrimary, fontWeight: '700', fontSize: 16 },
  countdownLabel: { color: Colors.textSecondary, fontSize: 10 },
  countdownSep: { color: Colors.textPrimary, fontWeight: '700' },
  stateQueenBtn: {
    alignSelf: 'center',
    marginTop: Spacing.sm,
    backgroundColor: '#7B22CC',
    borderWidth: 2,
    borderColor: STATE_COLORS.gold,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  stateQueenText: { color: Colors.textPrimary, fontWeight: '700' },
  inspectorPill: {
    alignSelf: 'center',
    marginTop: Spacing.xs,
    backgroundColor: 'rgba(123,79,255,0.35)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  inspectorText: { color: Colors.primaryLight, fontSize: 11, fontWeight: '600' },
  suggestBar: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.primarySubtle,
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  suggestText: { color: Colors.primaryLight, fontSize: 12, textAlign: 'center' },
  periodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.md,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  periodCenter: { alignItems: 'center' },
  periodToday: { fontWeight: '700', color: STATE_COLORS.rowText, fontSize: 16 },
  periodPool: { fontWeight: '600', color: STATE_COLORS.rowText, fontSize: 13 },
  podiumRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.xs, marginBottom: Spacing.md },
  podiumSide: { flex: 1 },
  podiumCenter: { flex: 1.15 },
  podiumSpacer: { height: 80 },
  podiumCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  podiumCardFirst: { marginBottom: Spacing.md, borderColor: STATE_COLORS.gold, borderWidth: 2 },
  podiumStateName: { color: Colors.textPrimary, fontWeight: '700', fontSize: 12 },
  podiumScore: { color: Colors.textPrimary, fontSize: 11, fontWeight: '600' },
  podiumReward: { color: STATE_COLORS.gold, fontSize: 11, fontWeight: '700' },
  avatarRow: { flexDirection: 'row', gap: 2, marginVertical: 2 },
  avatarWrap: { borderRadius: 14, overflow: 'hidden' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  iconSm: { width: 14, height: 14 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: STATE_COLORS.rowBg,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  listRank: { width: 24, fontWeight: '800', color: STATE_COLORS.rowText, fontSize: 16 },
  listStateName: { flex: 1, fontWeight: '600', color: STATE_COLORS.rowText },
  listRight: { alignItems: 'flex-end', gap: 2 },
  listScore: { fontSize: 12, fontWeight: '600', color: STATE_COLORS.rowText },
  listReward: { fontSize: 12, fontWeight: '700', color: '#8B2252' },
  footerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.md,
    backgroundColor: 'rgba(42,26,15,0.95)',
  },
  footerBar: { marginBottom: 0 },
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
