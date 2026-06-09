import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';

import { hostsApi, type LevelTaskRules } from '@api/hosts';
import { Colors, Radius, Spacing, Typography } from '@/theme';
import type { RootStackScreenProps } from '@navigation/types';
import type { RootState } from '@store/index';
import { canAccessLevelTask } from '@/utils/levelTaskEligibility';

type Props = RootStackScreenProps<'NewLevelTask'>;

const PURPLE = Colors.primary;
const BEAN_IMAGE = require('../../../assets/bean.png');

const TABLE = {
  headerBg: '#F0F0F0',
  border: '#E0E0E0',
  headerText: '#333333',
  bodyText: '#1A1A1A',
} as const;

function formatNum(n: number): string {
  return n.toLocaleString();
}

type HeaderCol = {
  label: string;
  showBean?: boolean;
};

type BodyCol = string | { lines: string[]; showBean?: boolean };

function RulesSection() {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>Rule</Text>
      <Text style={styles.bodyText}>
        The host&apos;s daily task depends on the recent seven (7) days&apos; total earnings
        (not platform rewards).
      </Text>
      <Text style={[styles.bodyText, styles.bodyGap]}>
        The daily income increases, and the live duration task reward can be upgraded immediately,
        but the task of the same period can only be claimed once. It is recommended to receive
        the task rewards after leveling up.
      </Text>
      <Text style={[styles.bodyText, styles.bodyGap]}>
        Income task reward can be claimed three (3) times every day.
      </Text>
    </View>
  );
}

function HeaderCell({ col, flex }: { col: HeaderCol; flex: number }) {
  return (
    <View style={[styles.headerCell, { flex }]}>
      <View style={styles.headerLabelRow}>
        <Text style={styles.headerText}>{col.label}</Text>
        {col.showBean ? (
          <Image source={BEAN_IMAGE} style={styles.headerBean} contentFit="contain" />
        ) : null}
      </View>
    </View>
  );
}

function BodyCell({ cell, flex, isLabel }: { cell: BodyCol; flex: number; isLabel?: boolean }) {
  const lines = typeof cell === 'string' ? cell.split('\n') : cell.lines;
  const showBean = typeof cell === 'object' && cell.showBean;

  return (
    <View style={[styles.bodyCell, { flex }]}>
      {showBean ? (
        <View style={styles.bodyBeanRow}>
          <Image source={BEAN_IMAGE} style={styles.bodyBean} contentFit="contain" />
          <Text style={[styles.bodyCellText, isLabel && styles.bodyLabelText, styles.bodyBeanText]}>
            {lines.join('\n')}
          </Text>
        </View>
      ) : (
        lines.map((line, i) => (
          <Text
            key={i}
            style={[styles.bodyCellText, isLabel && styles.bodyLabelText]}
            numberOfLines={3}
          >
            {line}
          </Text>
        ))
      )}
    </View>
  );
}

function RewardTable({
  headers,
  rows,
}: {
  headers: HeaderCol[];
  rows: BodyCol[][];
}) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHeaderRow}>
        {headers.map((h, i) => (
          <HeaderCell key={`h-${i}`} col={h} flex={1} />
        ))}
      </View>
      {rows.map((row, ri) => (
        <View
          key={`r-${ri}`}
          style={[styles.tableBodyRow, ri === rows.length - 1 && styles.tableBodyRowLast]}
        >
          {row.map((cell, ci) => (
            <BodyCell key={`c-${ri}-${ci}`} cell={cell} flex={1} isLabel={ci === 0} />
          ))}
        </View>
      ))}
    </View>
  );
}

export function NewLevelTaskScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const authUser = useSelector((s: RootState) => s.auth.user);
  const canParticipate = canAccessLevelTask(authUser);
  const [rules, setRules] = useState<LevelTaskRules | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await hostsApi.getLevelTaskRules();
      setRules(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const tiers = rules?.tiers ?? [];
  const dailyMaxK = Math.round((rules?.ordinary.dailyMaxBeans ?? 32_000) / 1000);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Level Task</Text>
        <View style={styles.headerSide} />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={PURPLE} />
      ) : !rules ? (
        <View style={styles.ineligibleBox}>
          <Text style={styles.ineligibleTitle}>Unable to load</Text>
          <Text style={styles.ineligibleText}>Host task rules could not be loaded. Please try again.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + Spacing.sm }]}
          showsVerticalScrollIndicator={false}
        >
          {!canParticipate ? (
            <View style={styles.viewOnlyBanner}>
              <Text style={styles.viewOnlyBannerText}>
                View host task rules. Rewards are for verified female hosts.
              </Text>
            </View>
          ) : null}
          <RulesSection />

          <View style={styles.section}>
            <Text style={styles.sectionHeading}>New Hosts</Text>
            <Text style={styles.bodyText}>
              Host within {rules?.newHosts.protectionDays ?? 7} days of registration can enjoy
              protection policy.
            </Text>
            <RewardTable
              headers={[
                { label: '' },
                { label: 'Live Duration Task Reward', showBean: true },
                { label: 'Total', showBean: true },
              ]}
              rows={[
                [
                  'NEW\nHosts',
                  {
                    lines: [
                      `${formatNum(rules?.newHosts.hourlyBeans ?? 4000)}/H`,
                      '3H/Day 7Days',
                    ],
                  },
                  { lines: [formatNum(rules?.newHosts.totalCapBeans ?? 84_000)] },
                ],
              ]}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Ordinary Hosts</Text>
            <Text style={styles.bodyText}>
              Not New Hosts and the recent 7 days&apos; income &lt;{' '}
              {formatNum(rules?.ordinary.maxSevenDayEarnings ?? 1_200_000)}
            </Text>
            <RewardTable
              headers={[
                { label: '' },
                { label: 'Live Duration Task Reward', showBean: true },
                { label: '50,000 Income Task Reward', showBean: true },
                { label: 'Hourly Max Task Reward', showBean: true },
                { label: 'Daily Max Reward' },
              ]}
              rows={[
                [
                  'Ordinary\nHosts',
                  {
                    lines: [
                      `${formatNum(rules?.ordinary.liveHourlyBeans ?? 2000)}/H`,
                      '*1H/Day',
                    ],
                  },
                  {
                    lines: [
                      `${formatNum(rules?.ordinary.incomeHourlyBeans ?? 10000)}/H`,
                      '*3H/Day',
                    ],
                  },
                  { lines: [`${formatNum(rules?.ordinary.hourlyMaxBeans ?? 12000)}/H`] },
                  { lines: [`${dailyMaxK}`], showBean: true },
                ],
              ]}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Level Task</Text>
            <RewardTable
              headers={[
                { label: '' },
                { label: 'Earning in the recent 7 days', showBean: true },
                { label: 'Task Reward of the day', showBean: true },
                { label: '50,000 Income Task Reward', showBean: true },
                { label: 'Hourly Max Task Reward' },
              ]}
              rows={tiers.map((t) => [
                t.levelCode,
                { lines: [formatNum(t.minSevenDayEarnings)] },
                { lines: [formatNum(t.dailyTaskRewardBeans)] },
                {
                  lines: [
                    `${formatNum(t.incomeTaskHourlyBeans)}/H`,
                    '*3H/Day',
                  ],
                },
                { lines: [`${formatNum(t.hourlyMaxBeans)}/H`] },
              ])}
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerSide: { width: 24 },
  headerTitle: {
    flex: 1,
    fontSize: Typography.sizes.lg,
    color: Colors.textPrimary,
    fontWeight: '700',
    textAlign: 'center',
  },
  loader: { marginTop: Spacing.sm, alignSelf: 'center' },
  scroll: {
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    alignItems: 'center',
  },
  section: { marginBottom: Spacing.sm, width: '100%', alignItems: 'center' },
  sectionHeading: {
    fontSize: Typography.sizes.lg,
    fontWeight: '700',
    color: PURPLE,
    marginBottom: Spacing.sm,
    textAlign: 'center',
    width: '100%',
  },
  bodyText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.sm,
    textAlign: 'center',
    width: '100%',
  },
  bodyGap: { marginTop: Spacing.sm },

  table: {
    width: '100%',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: TABLE.border,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: TABLE.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: TABLE.border,
  },
  headerCell: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 44,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: TABLE.border,
  },
  headerLabelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  headerText: {
    fontSize: 9,
    fontWeight: '600',
    color: TABLE.headerText,
    textAlign: 'center',
    lineHeight: 12,
  },
  headerBean: {
    width: 14,
    height: 14,
  },
  tableBodyRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: TABLE.border,
  },
  tableBodyRowLast: {
    borderBottomWidth: 0,
  },
  bodyCell: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 40,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: TABLE.border,
  },
  bodyCellText: {
    fontSize: 10,
    color: TABLE.bodyText,
    textAlign: 'center',
    lineHeight: 14,
  },
  bodyLabelText: {
    fontWeight: '600',
  },
  bodyBeanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    width: '100%',
  },
  bodyBean: {
    width: 16,
    height: 16,
  },
  bodyBeanText: {
    flexShrink: 1,
    textAlign: 'center',
  },
  viewOnlyBanner: {
    width: '100%',
    backgroundColor: Colors.primarySubtle,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  viewOnlyBannerText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  ineligibleBox: {
    flex: 1,
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ineligibleTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  ineligibleText: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
