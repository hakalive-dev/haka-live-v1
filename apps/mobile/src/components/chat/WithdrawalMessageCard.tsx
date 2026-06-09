import React from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { PayoutMethodIcon } from '@components/payments/PayoutMethodIcon';
import { Radius, Spacing } from '@/theme';
import type { WithdrawalUpdateDmPayload } from '@haka-live/shared-types/withdrawal-message-dm';

const SCREEN_WIDTH = Dimensions.get('window').width;
/** Beside 28px avatar + list padding — compact card, not full thread width. */
export const WITHDRAWAL_MESSAGE_CARD_WIDTH = Math.min(
  230,
  Math.round(SCREEN_WIDTH * 0.64),
);

type Props = {
  payload: WithdrawalUpdateDmPayload;
  onFooterPress: () => void;
};

function formatCardTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function footerLabel(action: WithdrawalUpdateDmPayload['footerAction']): string {
  return action === 'to_confirm' ? 'To confirm' : 'Check the details';
}

export function WithdrawalMessageCard({ payload, onFooterPress }: Props) {
  const isSuccess = payload.phase === 'success';
  const timeLabel = isSuccess ? 'Success time' : 'Remit time';
  const timeValue = formatCardTime(isSuccess ? payload.successTime : payload.remitTime);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{payload.title}</Text>

      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Status</Text>
        <View style={[styles.statusPill, isSuccess ? styles.statusPillSuccess : styles.statusPillPending]}>
          <Ionicons
            name={isSuccess ? 'checkmark-circle' : 'ellipsis-horizontal'}
            size={14}
            color={isSuccess ? '#22C97A' : '#E8A020'}
          />
          <Text style={styles.statusPillText}>{payload.statusLabel}</Text>
        </View>
      </View>

      <Text style={styles.description}>{payload.description}</Text>

      <View style={styles.metricsRow}>
        <View style={styles.metricCol}>
          <Text style={styles.metricLabel}>Payment amount</Text>
          <Text style={styles.metricValue}>{payload.paymentAmount}</Text>
        </View>
        <View style={styles.metricCol}>
          <Text style={styles.metricLabel}>Payment method</Text>
          <View style={styles.methodIcons}>
            <PayoutMethodIcon
              provider={payload.paymentMethodProvider || 'upi'}
              methodType={payload.paymentMethodType || 'upi'}
              size={22}
            />
          </View>
        </View>
        <View style={styles.metricCol}>
          <Text style={styles.metricLabel}>{timeLabel}</Text>
          <Text style={styles.metricValueSmall}>{timeValue}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <TouchableOpacity style={styles.footer} onPress={onFooterPress} activeOpacity={0.7}>
        <Text style={styles.footerText}>{footerLabel(payload.footerAction)}</Text>
        <Ionicons name="chevron-forward" size={16} color="#FF2D55" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: WITHDRAWAL_MESSAGE_CARD_WIDTH,
    alignSelf: 'flex-start',
    flexShrink: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginBottom: Spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  statusLabel: {
    fontSize: 13,
    color: '#888',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  statusPillPending: {
    backgroundColor: '#FFF8E6',
  },
  statusPillSuccess: {
    backgroundColor: '#E8F9F0',
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111',
  },
  description: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
    marginBottom: Spacing.md,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  metricCol: {
    flex: 1,
    minWidth: 0,
  },
  metricLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
  },
  metricValueSmall: {
    fontSize: 10,
    fontWeight: '600',
    color: '#111',
    lineHeight: 13,
  },
  methodIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 22,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#EEE',
    marginVertical: Spacing.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF2D55',
  },
});
