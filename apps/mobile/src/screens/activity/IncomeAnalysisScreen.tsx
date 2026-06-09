import React, { useCallback, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { activityApi } from '@api/activity';
import { Colors, Radius, Spacing } from '@/theme';
import { DetailSkeleton } from '@components/Skeleton';
import type { IncomeSummary, TopGifterEntry } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'IncomeAnalysis'>;
type Period = 'daily' | 'weekly' | 'monthly';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'daily',   label: 'Daily'   },
  { key: 'weekly',  label: 'Weekly'  },
  { key: 'monthly', label: 'Monthly' },
];

export function IncomeAnalysisScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  const [income, setIncome]       = useState<IncomeSummary | null>(null);
  const [gifters, setGifters]     = useState<TopGifterEntry[]>([]);
  const [period, setPeriod]       = useState<Period>('daily');
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);

  const load = useCallback((p: Period) => {
    setLoading(true);
    setError(false);
    Promise.all([activityApi.getIncome(p), activityApi.getTopGifters(p)])
      .then(([inc, g]) => {
        setIncome(inc);
        setGifters(g);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { load(period); }, [period]));

  const maxBeans = income
    ? Math.max(...income.chart.map((c) => c.beans_earned), 1)
    : 1;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Income Analysis</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Period selector */}
      <View style={styles.periodRow}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
            onPress={() => setPeriod(p.key)}
          >
            <Text style={[styles.periodText, period === p.key && styles.periodTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <DetailSkeleton />
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={Colors.danger} />
          <Text style={styles.errorText}>Failed to load income data</Text>
        </View>
      ) : (
        <FlatList
          data={gifters}
          keyExtractor={(g) => g.user.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.xxxl }]}
          ListHeaderComponent={
            <>
              {/* Summary cards */}
              <View style={styles.cardsRow}>
                <SummaryCard
                  label="Total Beans"
                  value={(income?.total_beans_earned ?? 0).toLocaleString()}
                  color={Colors.success}
                />
                <SummaryCard
                  label="Gifts Received"
                  value={String(income?.total_gifts_received ?? 0)}
                  color={Colors.gold}
                />
                <SummaryCard
                  label="Sessions"
                  value={String(income?.total_room_sessions ?? 0)}
                  color={Colors.primary}
                />
                {(income?.commission_earned ?? 0) > 0 && (
                  <SummaryCard
                    label="Commission"
                    value={(income?.commission_earned ?? 0).toLocaleString()}
                    color={Colors.info}
                  />
                )}
              </View>

              {/* Bar chart */}
              {income && income.chart.length > 0 && (
                <View style={styles.chartSection}>
                  <Text style={styles.chartTitle}>Beans Earned</Text>
                  <View style={styles.chart}>
                    {income.chart.slice(-14).map((row) => {
                      const pct = row.beans_earned / maxBeans;
                      return (
                        <View key={row.label} style={styles.barCol}>
                          <Text style={styles.barValue}>
                            {row.beans_earned > 999
                              ? `${(row.beans_earned / 1000).toFixed(1)}k`
                              : String(row.beans_earned)}
                          </Text>
                          <View style={styles.barTrack}>
                            <View
                              style={[
                                styles.barFill,
                                { height: `${Math.max(4, Math.round(pct * 100))}%` },
                              ]}
                            />
                          </View>
                          <Text style={styles.barLabel}>{row.label}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              <Text style={styles.sectionTitle}>Top Gifters</Text>
            </>
          }
          renderItem={({ item, index }) => <GifterRow entry={item} rank={index + 1} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No gifter data for this period</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// -- Sub-components -----------------------------------------------------------

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function GifterRow({ entry, rank }: { entry: TopGifterEntry; rank: number }) {
  return (
    <View style={styles.gifterRow}>
      <View style={styles.rankCircle}>
        <Text style={styles.rankText}>{rank}</Text>
      </View>
      <View style={styles.gifterAvatar}>
        <Text style={styles.avatarText}>
          {entry.user.displayName.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.gifterInfo}>
        <Text style={styles.gifterName}>{entry.user.displayName}</Text>
        <Text style={styles.gifterUsername}>@{entry.user.username}</Text>
      </View>
      <View style={styles.gifterRight}>
        <Text style={styles.gifterCoins}>{entry.total_coin_value.toLocaleString()} coins</Text>
        <Text style={styles.gifterCount}>{entry.gift_count} gifts</Text>
      </View>
    </View>
  );
}

// -- Styles -------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1, color: Colors.textPrimary, fontSize: 17,
    fontWeight: '700', textAlign: 'center',
  },
  periodRow: {
    flexDirection: 'row', padding: Spacing.md, gap: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  periodBtn: {
    flex: 1, height: 36, alignItems: 'center', justifyContent: 'center',
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border,
  },
  periodBtnActive: { backgroundColor: Colors.primarySubtle, borderColor: Colors.primary },
  periodText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  periodTextActive: { color: Colors.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  errorText: { color: Colors.textSecondary, fontSize: 14 },
  listContent: { paddingBottom: Spacing.xxxl },

  // Summary cards
  cardsRow: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.lg },
  summaryCard: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, gap: 4, alignItems: 'center',
  },
  summaryValue: { fontSize: 14, fontWeight: '700' },
  summaryLabel: { color: Colors.textTertiary, fontSize: 10, textAlign: 'center' },

  // Bar chart
  chartSection: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },
  chartTitle: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing.md },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 4 },
  barCol: { flex: 1, alignItems: 'center', gap: 3, height: 120 },
  barValue: { color: Colors.textTertiary, fontSize: 8, textAlign: 'center' },
  barTrack: { flex: 1, width: '100%', backgroundColor: Colors.surfaceElevated, borderRadius: 3, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', backgroundColor: Colors.primary, borderRadius: 3 },
  barLabel: { color: Colors.textTertiary, fontSize: 8, textAlign: 'center' },

  sectionTitle: {
    color: Colors.textSecondary, fontSize: 12, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm,
  },

  // Gifter rows
  gifterRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  rankCircle: {
    width: 24, height: 24, borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  rankText: { color: Colors.textSecondary, fontSize: 11, fontWeight: '700' },
  gifterAvatar: {
    width: 40, height: 40, borderRadius: Radius.full,
    backgroundColor: Colors.primarySubtle,
    alignItems: 'center', justifyContent: 'center',
    marginRight: Spacing.md,
  },
  avatarText: { color: Colors.primary, fontSize: 16, fontWeight: '700' },
  gifterInfo: { flex: 1, gap: 2 },
  gifterName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  gifterUsername: { color: Colors.textSecondary, fontSize: 12 },
  gifterRight: { alignItems: 'flex-end', gap: 2 },
  gifterCoins: { color: Colors.gold, fontSize: 13, fontWeight: '600' },
  gifterCount: { color: Colors.textTertiary, fontSize: 11 },

  emptyBox: { alignItems: 'center', paddingTop: 40 },
  emptyText: { color: Colors.textTertiary, fontSize: 14 },
});
