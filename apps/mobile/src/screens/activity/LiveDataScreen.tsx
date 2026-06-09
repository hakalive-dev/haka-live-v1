import React, { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { activityApi } from '@api/activity';
import { Colors, Radius, Spacing } from '@/theme';
import { DetailSkeleton } from '@components/Skeleton';
import { CopyableId } from '@components/CopyableId';
import type {
  LiveDataChartEntry,
  LiveDataDaily,
  LiveDataMonthly,
  LiveDataWeekly,
} from '@/types';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'LiveData'>;
type Period = 'daily' | 'weekly' | 'monthly';
type HeaderTab = 'live' | 'pk';
type PkTab = 'random' | 'friend' | 'team';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly Data' },
  { key: 'monthly', label: 'Monthly Data' },
];

const SCREEN_W = Dimensions.get('window').width;

export function LiveDataScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [headerTab, setHeaderTab] = useState<HeaderTab>('live');
  const [period, setPeriod] = useState<Period>('daily');
  const [loading, setLoading] = useState(true);

  // Data states
  const [dailyData, setDailyData] = useState<LiveDataDaily | null>(null);
  const [weeklyData, setWeeklyData] = useState<LiveDataWeekly | null>(null);
  const [monthlyData, setMonthlyData] = useState<LiveDataMonthly | null>(null);

  // Offsets for navigation
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (period === 'daily') {
        const d = await activityApi.getLiveDataDaily(selectedDate);
        setDailyData(d);
      } else if (period === 'weekly') {
        const w = await activityApi.getLiveDataWeekly(weekOffset);
        setWeeklyData(w);
      } else {
        const m = await activityApi.getLiveDataMonthly(monthOffset);
        setMonthlyData(m);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [period, selectedDate, weekOffset, monthOffset]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerTabs}>
          <TouchableOpacity onPress={() => setHeaderTab('live')}>
            <Text style={[styles.headerTabText, headerTab === 'live' && styles.headerTabActive]}>
              Live data
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setHeaderTab('pk')}>
            <Text style={[styles.headerTabText, headerTab === 'pk' && styles.headerTabActive]}>
              PK data
            </Text>
          </TouchableOpacity>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {/* Period tabs — only for live data */}
      {headerTab === 'live' && (
        <View style={styles.periodRow}>
          {PERIODS.map((p) => (
            <TouchableOpacity key={p.key} onPress={() => setPeriod(p.key)}>
              <Text style={[styles.periodText, period === p.key && styles.periodActive]}>
                {p.label}
              </Text>
              {period === p.key && <View style={styles.periodUnderline} />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {headerTab === 'pk' ? (
        <PkDataView insets={insets} />
      ) : loading ? (
        <DetailSkeleton />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxxl }}
        >
          {period === 'daily' && dailyData && (
            <DailyView
              data={dailyData}
              date={selectedDate}
              onDateChange={setSelectedDate}
            />
          )}
          {period === 'weekly' && weeklyData && (
            <WeeklyView
              data={weeklyData}
              offset={weekOffset}
              onOffsetChange={setWeekOffset}
            />
          )}
          {period === 'monthly' && monthlyData && (
            <MonthlyView
              data={monthlyData}
              offset={monthOffset}
              onOffsetChange={setMonthOffset}
            />
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── PK Data View ────────────────────────────────────────────────────────────

const PK_TABS: { key: PkTab; label: string }[] = [
  { key: 'random', label: 'Random PK' },
  { key: 'friend', label: 'Friend PK' },
  { key: 'team', label: 'Team PK' },
];

function PkDataView({ insets }: { insets: { bottom: number } }) {
  const [pkTab, setPkTab] = useState<PkTab>('random');

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxxl }}
    >
      {/* PK sub-tabs */}
      <View style={pkStyles.tabRow}>
        {PK_TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[pkStyles.tab, pkTab === t.key && pkStyles.tabActive]}
            onPress={() => setPkTab(t.key)}
          >
            <Text style={[pkStyles.tabText, pkTab === t.key && pkStyles.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Stat cards */}
      <View style={pkStyles.cardsRow}>
        {/* Win% */}
        <LinearGradient
          colors={['#F5C842', '#E8A020']}
          style={pkStyles.statCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={pkStyles.statValue}>0%</Text>
          <Text style={pkStyles.statLabel}>Win%</Text>
        </LinearGradient>

        {/* PK Score */}
        <LinearGradient
          colors={['#FF6B6B', '#FF4D8D']}
          style={pkStyles.statCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={pkStyles.statValue}>0</Text>
          <Text style={pkStyles.statLabel}>PK Score</Text>
        </LinearGradient>

        {/* Sessions */}
        <LinearGradient
          colors={['#4DA6FF', '#2D7BD4']}
          style={pkStyles.statCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={pkStyles.statValue}>0</Text>
          <Text style={pkStyles.statLabel}>Sessions</Text>
        </LinearGradient>
      </View>

      {/* Historical record */}
      <View style={pkStyles.historySection}>
        <Text style={pkStyles.historyTitle}>Historical record</Text>
        <View style={pkStyles.historyEmpty}>
          <Ionicons name="document-text-outline" size={48} color="#DDD" />
          <Text style={pkStyles.historyEmptyText}>
            No record invite friends to PK
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const pkStyles = StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  tab: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    backgroundColor: '#F5F5F5',
  },
  tabActive: {
    backgroundColor: '#000',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
  },
  tabTextActive: {
    color: '#FFF',
  },
  cardsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFF',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  historySection: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: Spacing.md,
  },
  historyEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxxl,
    gap: Spacing.md,
  },
  historyEmptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});

// ── Daily View ───────────────────────────────────────────────────────────────

function DailyView({
  data,
  date,
  onDateChange,
}: {
  data: LiveDataDaily;
  date: string;
  onDateChange: (d: string) => void;
}) {
  const navigateDate = (dir: -1 | 1) => {
    const d = new Date(date);
    d.setDate(d.getDate() + dir);
    onDateChange(d.toISOString().slice(0, 10));
  };

  return (
    <View>
      {/* Purple card */}
      <LinearGradient
        colors={['#EDE7FF', '#F5F0FF']}
        style={styles.dailyCard}
      >
        {/* Date selector */}
        <View style={styles.dateRow}>
          <TouchableOpacity onPress={() => navigateDate(-1)} hitSlop={8}>
            <Ionicons name="chevron-back" size={16} color="#666" />
          </TouchableOpacity>
          <Text style={styles.dateText}>{date}</Text>
          <TouchableOpacity onPress={() => navigateDate(1)} hitSlop={8}>
            <Ionicons name="chevron-forward" size={16} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Won Points */}
        <Text style={styles.wonPointsValue}>{data.won_points.toLocaleString()}</Text>
        <Text style={styles.wonPointsLabel}>Won Points</Text>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <StatCell label="Live duration" value={data.live_duration} />
          <StatCell label="Live earnings" value={String(data.live_earnings)} />
        </View>
        <View style={styles.statsGrid}>
          <StatCell label="Party duration" value={data.party_duration} />
          <StatCell label="Party earnings" value={String(data.party_earnings)} />
        </View>
        <View style={styles.statsGridCenter}>
          <StatCell label="Party crown duration" value={data.party_crown_duration} centered />
        </View>
        <View style={styles.statsGrid}>
          <StatCell label="The number of new fans" value={String(data.new_fans_count)} />
          <StatCell label="New members of fans club" value={String(data.new_fans_club_count)} />
        </View>
      </LinearGradient>

      {/* Get more points button */}
      <TouchableOpacity style={styles.getPointsBtn}>
        <LinearGradient
          colors={Colors.gradientPurple}
          style={styles.getPointsBtnGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Text style={styles.getPointsBtnText}>Get more points</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

// ── Weekly View ──────────────────────────────────────────────────────────────

function WeeklyView({
  data,
  offset,
  onOffsetChange,
}: {
  data: LiveDataWeekly;
  offset: number;
  onOffsetChange: (o: number) => void;
}) {
  return (
    <View>
      {/* Week selector */}
      <View style={styles.periodSelector}>
        <TouchableOpacity
          style={styles.periodNavBtn}
          onPress={() => onOffsetChange(offset + 1)}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={16} color="#666" />
        </TouchableOpacity>
        <Text style={styles.periodSelectorText}>
          {offset === 0 ? 'Current Week' : `Week of ${data.week_start}`}
        </Text>
        <TouchableOpacity
          style={styles.periodNavBtn}
          onPress={() => onOffsetChange(Math.max(0, offset - 1))}
          hitSlop={8}
          disabled={offset === 0}
        >
          <Ionicons name="chevron-forward" size={16} color={offset === 0 ? '#DDD' : '#666'} />
        </TouchableOpacity>
        <CopyableId value={data.hakaId} textStyle={styles.hakaIdText} />
      </View>

      {/* Dual chart */}
      <DualChart chart={data.chart} />

      {/* Legend */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#FF4D4D' }]} />
          <Text style={styles.legendText}>Points</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#4DA6FF' }]} />
          <Text style={styles.legendText}>Live broadcast duration (minutes)</Text>
        </View>
      </View>

      {/* Summary stats */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryValue}>{data.total_duration}</Text>
          <Text style={styles.summaryLabel}>Total Duration (h/min)</Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={[styles.summaryValue, { color: '#FF4D4D' }]}>
            {data.total_earnings.toLocaleString()}
          </Text>
          <Text style={styles.summaryLabel}>Total Earnings</Text>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryValue}>{data.new_fans_count}</Text>
          <Text style={styles.summaryLabel}>The number of new fans</Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryValue}>{data.new_fans_club_count}</Text>
          <Text style={styles.summaryLabel}>The number of new fans club</Text>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryValue}>{data.gifting_count}</Text>
          <Text style={styles.summaryLabel}>Gifting this week</Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryValue}>{data.unfollowers_count}</Text>
          <Text style={styles.summaryLabel}>Number of Un-followers this week</Text>
        </View>
      </View>
    </View>
  );
}

// ── Monthly View ─────────────────────────────────────────────────────────────

function MonthlyView({
  data,
  offset,
  onOffsetChange,
}: {
  data: LiveDataMonthly;
  offset: number;
  onOffsetChange: (o: number) => void;
}) {
  return (
    <View>
      {/* Month selector */}
      <View style={styles.periodSelector}>
        <TouchableOpacity
          style={styles.periodNavBtn}
          onPress={() => onOffsetChange(offset + 1)}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={16} color="#666" />
        </TouchableOpacity>
        <Text style={styles.periodSelectorText}>
          {offset === 0 ? 'This month' : data.month_start.slice(0, 7)}
        </Text>
        <TouchableOpacity
          style={styles.periodNavBtn}
          onPress={() => onOffsetChange(Math.max(0, offset - 1))}
          hitSlop={8}
          disabled={offset === 0}
        >
          <Ionicons name="chevron-forward" size={16} color={offset === 0 ? '#DDD' : '#666'} />
        </TouchableOpacity>
        <CopyableId value={data.hakaId} textStyle={styles.hakaIdText} />
      </View>

      {/* Dual chart */}
      <DualChart chart={data.chart} />

      {/* Legend */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#FF4D4D' }]} />
          <Text style={styles.legendText}>Points</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#4DA6FF' }]} />
          <Text style={styles.legendText}>Duration</Text>
        </View>
      </View>

      {/* Summary stats */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryValue}>{data.total_duration}</Text>
          <Text style={styles.summaryLabel}>Total Duration (h/min)</Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={[styles.summaryValue, { color: '#FF4D4D' }]}>
            {data.total_earnings.toLocaleString()}
          </Text>
          <Text style={styles.summaryLabel}>Total Earnings</Text>
        </View>
      </View>

      {/* Past 3 months earnings */}
      <View style={styles.past3Row}>
        <Text style={styles.past3Label}>
          Total earning in the past 3 month (excluding platform rewards):
        </Text>
        <View style={styles.past3ValueRow}>
          <Ionicons name="logo-bitcoin" size={14} color="#FF4D4D" />
          <Text style={styles.past3Value}>{data.past_3_months_earnings.toLocaleString()}</Text>
        </View>
      </View>
    </View>
  );
}

// ── Dual Chart Component ────────────────────────────────────────────────────

function DualChart({ chart }: { chart: LiveDataChartEntry[] }) {
  const maxPoints = Math.max(...chart.map((c) => c.points), 1);
  const maxDuration = Math.max(...chart.map((c) => c.duration_minutes), 1);
  const chartWidth = SCREEN_W - Spacing.lg * 2;
  const barW = Math.max(4, Math.min(20, (chartWidth - chart.length * 4) / chart.length));

  return (
    <View style={styles.chartContainer}>
      {/* Points row (top) */}
      <View style={styles.chartRow}>
        {chart.map((entry, i) => (
          <View key={`p-${i}`} style={[styles.chartCol, { width: barW + 4 }]}>
            <Text style={styles.chartDotValue}>{entry.points}</Text>
            <View
              style={[
                styles.chartDot,
                { backgroundColor: '#FF4D4D' },
              ]}
            />
          </View>
        ))}
      </View>

      {/* Divider line */}
      <View style={styles.chartLine} />

      {/* Duration row (bottom) */}
      <View style={styles.chartRow}>
        {chart.map((entry, i) => {
          const minutes = entry.duration_minutes;
          const h = Math.floor(minutes / 60);
          const m = minutes % 60;
          const label = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
          return (
            <View key={`d-${i}`} style={[styles.chartCol, { width: barW + 4 }]}>
              <View
                style={[
                  styles.chartDot,
                  { backgroundColor: '#4DA6FF' },
                ]}
              />
              <Text style={styles.chartDotValueBlue}>{label}</Text>
            </View>
          );
        })}
      </View>

      {/* Date labels */}
      <View style={styles.chartLabelsRow}>
        {chart.map((entry, i) => (
          <Text key={`l-${i}`} style={[styles.chartLabel, { width: barW + 4 }]}>
            {entry.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ── StatCell ────────────────────────────────────────────────────────────────

function StatCell({
  label,
  value,
  centered,
}: {
  label: string;
  value: string;
  centered?: boolean;
}) {
  return (
    <View style={[styles.statCell, centered && { alignItems: 'center', flex: 0, width: '100%' as unknown as number }]}>
      <Text style={styles.statCellValue}>{value}</Text>
      <Text style={styles.statCellLabel}>{label}</Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTabs: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xl,
  },
  headerTabText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#999',
  },
  headerTabActive: {
    color: '#000',
  },

  // Period tabs
  periodRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  periodText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#999',
    paddingBottom: Spacing.sm,
  },
  periodActive: {
    color: '#000',
    fontWeight: '600',
  },
  periodUnderline: {
    height: 2,
    backgroundColor: '#000',
    borderRadius: 1,
  },

  emptyCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  emptyText: { fontSize: 14, color: '#999' },

  // ── Daily ──────────────────────────────────────────────────────────────────
  dailyCard: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: '#FFF',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333',
  },
  wonPointsValue: {
    fontSize: 48,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  wonPointsLabel: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statsGridCenter: {
    alignItems: 'center',
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  statCellValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  statCellLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
    textAlign: 'center',
  },

  getPointsBtn: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  getPointsBtnGradient: {
    height: 48,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  getPointsBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },

  // ── Period selector (weekly/monthly) ───────────────────────────────────────
  periodSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  periodNavBtn: {
    padding: Spacing.xs,
  },
  periodSelectorText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#000',
  },
  hakaIdText: {
    fontSize: 12,
    color: '#999',
    marginLeft: 'auto',
  },

  // ── Chart ──────────────────────────────────────────────────────────────────
  chartContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  chartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  chartCol: {
    alignItems: 'center',
    gap: 2,
  },
  chartDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chartDotValue: {
    fontSize: 9,
    color: '#FF4D4D',
    fontWeight: '600',
  },
  chartDotValueBlue: {
    fontSize: 9,
    color: '#4DA6FF',
    fontWeight: '600',
  },
  chartLine: {
    height: 2,
    backgroundColor: '#4DA6FF',
    marginVertical: Spacing.xs,
  },
  chartLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  chartLabel: {
    fontSize: 8,
    color: '#999',
    textAlign: 'center',
  },

  // Legend
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: '#666',
  },

  // Summary
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  summaryCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
    textAlign: 'center',
  },

  // Past 3 months
  past3Row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  past3Label: {
    flex: 1,
    fontSize: 11,
    color: '#999',
  },
  past3ValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  past3Value: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF4D4D',
  },
});
