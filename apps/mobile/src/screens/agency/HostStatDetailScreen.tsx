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

import { agencyApi } from '@api/agency';
import { Colors, Radius, Spacing } from '@/theme';
import { DetailSkeleton } from '@components/Skeleton';
import type { HostStatEntry } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'HostStatDetail'>;
type Period = 'daily' | 'weekly' | 'monthly';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'daily',   label: 'Daily'   },
  { key: 'weekly',  label: 'Weekly'  },
  { key: 'monthly', label: 'Monthly' },
];

export function HostStatDetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { hostId, displayName } = route.params;

  const [stats, setStats]     = useState<HostStatEntry[]>([]);
  const [period, setPeriod]   = useState<Period>('daily');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  const load = useCallback((p: Period) => {
    setLoading(true);
    setError(false);
    agencyApi.getHostStats(hostId, p)
      .then(setStats)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [hostId]);

  useFocusEffect(useCallback(() => { load(period); }, [period]));

  const totalHostBeans  = stats.reduce((s, r) => s + r.host_beans_earned, 0);
  const totalCommission = stats.reduce((s, r) => s + r.agency_commission_earned, 0);
  const totalGifts      = stats.reduce((s, r) => s + r.gift_count, 0);
  const maxBeans        = Math.max(...stats.map((r) => r.host_beans_earned), 1);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{displayName}</Text>
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
          <Text style={styles.errorText}>Failed to load stats</Text>
        </View>
      ) : (
        <FlatList
          data={stats}
          keyExtractor={(s) => s.date}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.xxxl }]}
          ListHeaderComponent={
            <>
              {/* Summary cards */}
              <View style={styles.cardsRow}>
                <SummaryCard
                  label="Host Earned"
                  value={`${totalHostBeans.toLocaleString()} 🫘`}
                  color={Colors.success}
                />
                <SummaryCard
                  label="Your Commission"
                  value={`${totalCommission.toLocaleString()} 🫘`}
                  color={Colors.primary}
                />
                <SummaryCard
                  label="Gifts"
                  value={String(totalGifts)}
                  color={Colors.gold}
                />
              </View>

              {/* Custom bar chart */}
              {stats.length > 0 && (
                <View style={styles.chartSection}>
                  <Text style={styles.chartTitle}>Host Beans by Day</Text>
                  <View style={styles.chart}>
                    {stats.slice(-14).map((row) => {
                      const pct = row.host_beans_earned / maxBeans;
                      return (
                        <View key={row.date} style={styles.barCol}>
                          <Text style={styles.barValue}>
                            {row.host_beans_earned > 999
                              ? `${(row.host_beans_earned / 1000).toFixed(1)}k`
                              : String(row.host_beans_earned)}
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
                            {row.date.slice(5)}
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
          renderItem={({ item }) => <StatRow entry={item} />}
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

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function StatRow({ entry }: { entry: HostStatEntry }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statDate}>{entry.date}</Text>
      <View style={styles.statRight}>
        <Text style={styles.statBeans}>{entry.host_beans_earned.toLocaleString()} 🫘</Text>
        <Text style={styles.statCommission}>+{entry.agency_commission_earned.toLocaleString()} yours</Text>
        <Text style={styles.statGifts}>{entry.gift_count} gifts</Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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

  // Stat rows
  statRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  statDate: { color: Colors.textPrimary, fontSize: 13, fontWeight: '500' },
  statRight: { alignItems: 'flex-end', gap: 2 },
  statBeans: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600' },
  statCommission: { color: Colors.success, fontSize: 11 },
  statGifts: { color: Colors.textTertiary, fontSize: 11 },

  emptyBox: { alignItems: 'center', paddingTop: 40 },
  emptyText: { color: Colors.textTertiary, fontSize: 14 },
});
