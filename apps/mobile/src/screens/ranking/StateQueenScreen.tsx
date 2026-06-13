import React from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { UserAvatar } from '@components/UserAvatar';
import { stateRankingApi } from '@api/stateRanking';
import { Colors, Spacing, Radius } from '@/theme';
import type { RootStackParamList } from '@navigation/types';
import type { RootState } from '@store/index';

type Props = NativeStackScreenProps<RootStackParamList, 'StateQueen'>;

const GOLD_BAG = require('../../../assets/ranking/state-star/gold-bag.png');

function formatNum(n: number): string {
  return n.toLocaleString();
}

export function StateQueenScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const user = useSelector((s: RootState) => s.auth.user);
  const { stateCode, stateName, countryCode } = route.params;

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

  const items = hostsQuery.data?.items ?? [];
  const myRank = myHostQuery.data;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>State Queen — {stateName}</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.user.id}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: insets.bottom + 88 }}
        refreshControl={
          <RefreshControl
            refreshing={hostsQuery.isFetching}
            onRefresh={() => void hostsQuery.refetch()}
            tintColor={Colors.gold}
          />
        }
        ListEmptyComponent={
          !hostsQuery.isLoading ? (
            <Text style={styles.empty}>No ranked hosts in this state yet</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rank}>{item.rank}</Text>
            <UserAvatar
              user={{
                displayName: item.user.displayName,
                avatar: item.user.avatar,
                equippedFrame: null,
              }}
              size={40}
            />
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={1}>
                {item.user.displayName}
              </Text>
              <View style={styles.scoreRow}>
                <Image source={GOLD_BAG} style={styles.icon} />
                <Text style={styles.score}>{formatNum(item.score)}</Text>
              </View>
            </View>
          </View>
        )}
      />

      {myRank?.eligible && myRank.rank != null ? (
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
  screen: { flex: 1, backgroundColor: '#2A1A0F' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  title: { flex: 1, textAlign: 'center', color: Colors.textPrimary, fontWeight: '700', fontSize: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#C4A574',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  rank: { width: 28, fontWeight: '800', fontSize: 18, color: '#1A1208' },
  info: { flex: 1 },
  name: { fontWeight: '600', color: '#1A1208', marginBottom: 2 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  icon: { width: 14, height: 14 },
  score: { fontSize: 12, fontWeight: '600', color: '#1A1208' },
  empty: { color: Colors.textTertiary, textAlign: 'center', padding: Spacing.xl },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(42,26,15,0.95)',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  footerText: { color: Colors.textPrimary, textAlign: 'center', fontWeight: '600' },
});
