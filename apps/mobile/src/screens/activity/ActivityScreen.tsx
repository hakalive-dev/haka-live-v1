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
import type { ActivitySummary, ActivityChartEntry } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'Activity'>;
type Period = 'daily' | 'weekly' | 'monthly';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'daily',   label: 'Daily'   },
  { key: 'weekly',  label: 'Weekly'  },
  { key: 'monthly', label: 'Monthly' },
];

export function ActivityScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  const [summary, setSummary]   = useState<ActivitySummary | null>(null);
  const [chart, setChart]       = useState<ActivityChartEntry[]>([]);
  const [period, setPeriod]     = useState<Period>('daily');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);

  const load = useCallback((p: Period) => {
    setLoading(true);
    setError(false);
    Promise.all([
      activityApi.getSummary(p),
      activityApi.getChart(p),
    ])
      .then(([summaryData, chartData]) => {
        setSummary(summaryData);
        setChart(chartData);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { load(period); }, [period]));

  const maxBeans = Math.max(...chart.map((r) => r.beans_earned), 1);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>My Activity</Text>
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
          <Text style={styles.errorText}>Failed to load activity</Text>
        </View>
      ) : (
        <FlatList
          data={chart}
          keyExtractor={(c) => c.label}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.xxxl }]}
          ListHeaderComponent={
            <>
              {/* Summary cards */}
              <View style={styles.cardsRow}>
                <SummaryCard
                  label="Coins Spent"
                  value={summary ? summary.coins_spent.toLocaleString() : '0'}
                  color={Colors.gold}
                />
                <SummaryCard
                  label="Beans Earned"
                  value={summary ? summary.beans_earned.toLocaleString() : '0'}
                  color={Colors.success}
                />
                <SummaryCard
                  label="Gifts Sent"
                  value={summary ? String(summary.gifts_sent_count) : '0'}
                  color={Colors.primary}
                />
                <SummaryCard
                  label="Room Sessions"
                  value={summary ? String(summary.room_sessions) : '0'}
                  color={Colors.info}
                />
              </View>

              {/* Custom bar chart */}
              {chart.length > 0 && (
                <View style={styles.chartSection}>
                  <Text style={styles.chartTitle}>Beans Earned</Text>
                  <View style={styles.chart}>
                    {chart.slice(-14).map((row) => {
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
                          <Text style={styles.barLabel}>
                            {row.label.slice(3)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              <Text style={styles.sectionTitle}>Detail</Text>
            </>
          }
          renderItem={({ item }) => <DetailRow entry={item} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No data for this period</Text>
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

function DetailRow({ entry }: { entry: ActivityChartEntry }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statDate}>{entry.label}</Text>
      <View style={styles.statRight}>
        <Text style={styles.statCoins}>{entry.coins_spent.toLocaleString()} coins</Text>
        <Text style={styles.statBeans}>{entry.beans_earned.toLocaleString()} beans</Text>
        <Text style={styles.statGifts}>{entry.gifts_sent_count} gifts</Text>
        <Text style={styles.statRooms}>{entry.room_sessions} sessions</Text>
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

  // Detail rows
  statRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  statDate: { color: Colors.textPrimary, fontSize: 13, fontWeight: '500' },
  statRight: { alignItems: 'flex-end', gap: 2 },
  statCoins: { color: Colors.gold, fontSize: 13, fontWeight: '600' },
  statBeans: { color: Colors.success, fontSize: 11 },
  statGifts: { color: Colors.primary, fontSize: 11 },
  statRooms: { color: Colors.textTertiary, fontSize: 11 },

  emptyBox: { alignItems: 'center', paddingTop: 40 },
  emptyText: { color: Colors.textTertiary, fontSize: 14 },
});
