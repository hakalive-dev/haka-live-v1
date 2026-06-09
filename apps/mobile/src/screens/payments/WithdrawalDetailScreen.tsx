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
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';

import { walletApi, type WithdrawalDetail } from '@api/wallet';
import { PayoutMethodIcon } from '@components/payments/PayoutMethodIcon';
import { Colors, Radius, Spacing } from '@/theme';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'WithdrawalDetail'>;

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  GBP: '£',
  USD: '$',
  EUR: '€',
  PHP: '₱',
};

function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code.trim().toUpperCase()] ?? code;
}

function formatLocalAmount(amount: number | null, currency: string): string {
  if (amount == null) return '—';
  const sym = currencySymbol(currency);
  return `${sym} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function isCompleted(status: string): boolean {
  return status === 'completed' || status === 'approved' || status === 'paid';
}

export function WithdrawalDetailScreen({ route, navigation }: Props) {
  const { withdrawalId } = route.params;
  const insets = useSafeAreaInsets();
  const [detail, setDetail] = useState<WithdrawalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    walletApi
      .getWithdrawalDetail(withdrawalId)
      .then(setDetail)
      .catch((e: unknown) => {
        Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load withdrawal');
        navigation.goBack();
      })
      .finally(() => setLoading(false));
  }, [withdrawalId, navigation]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const copyText = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', `${label} copied to clipboard`);
  };

  const handleConfirmReceipt = async () => {
    setConfirming(true);
    try {
      await walletApi.confirmWithdrawalReceipt(withdrawalId);
      Alert.alert('Confirmed', 'Thank you for confirming receipt.');
      load();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to confirm');
    } finally {
      setConfirming(false);
    }
  };

  const handleDispute = () => {
    Alert.prompt(
      "Don't received?",
      'Describe the issue (e.g. payment not received):',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async (reason?: string) => {
            if (!reason?.trim()) {
              Alert.alert('Required', 'Please enter a reason.');
              return;
            }
            try {
              await walletApi.disputeWithdrawal(withdrawalId, reason.trim());
              Alert.alert('Submitted', 'Your dispute has been submitted for admin review.');
              load();
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed to submit dispute');
            }
          },
        },
      ],
      'plain-text',
    );
  };

  const showConfirm =
    detail?.status === 'proof_submitted' && !detail.userConfirmedAt;
  const showDispute = detail && isCompleted(detail.status) && !detail.disputedAt;
  const provider = (detail?.payout?.provider as string) ?? 'upi';
  const methodType = (detail?.payout?.methodType as string) ?? 'upi';

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Details</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading || !detail ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xxl }]}
          showsVerticalScrollIndicator={false}
        >
          {isCompleted(detail.status) ? (
            <View style={styles.successBadge}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
              <Text style={styles.successBadgeText}>Success</Text>
            </View>
          ) : null}

          <View style={styles.amountRow}>
            <View style={styles.amountCol}>
              <Text style={styles.amountLabel}>Withdrawal amount</Text>
              <Text style={styles.amountValue}>
                {formatLocalAmount(detail.localAmount, detail.currency)}
              </Text>
            </View>
            <View style={styles.methodTile}>
              <PayoutMethodIcon provider={provider} methodType={methodType} size={28} />
            </View>
          </View>

          <View style={styles.metaBlock}>
            <View style={styles.metaLine}>
              <Text style={styles.metaText}>Order number: {detail.orderId}</Text>
              <TouchableOpacity
                hitSlop={8}
                onPress={() => void copyText(detail.orderId, 'Order number')}
              >
                <Ionicons name="copy-outline" size={16} color="#999" />
              </TouchableOpacity>
            </View>
            <Text style={styles.metaText}>
              Order create time: {formatTimestamp(detail.createdAt)}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Account information</Text>
            {detail.accountRows.length === 0 ? (
              <Text style={styles.emptyRow}>No account details available</Text>
            ) : (
              detail.accountRows.map((row) => (
                <View key={row.label} style={styles.accountRow}>
                  <Text style={styles.accountLabel}>{row.label}</Text>
                  <View style={styles.accountValueRow}>
                    <Text style={styles.accountValue}>{row.value}</Text>
                    <TouchableOpacity
                      hitSlop={8}
                      onPress={() => void copyText(row.value, row.label)}
                    >
                      <Ionicons name="copy-outline" size={16} color="#999" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>

          {detail.proofUrl ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Payment proof</Text>
              <Image
                source={{ uri: detail.proofUrl }}
                style={styles.proofImage}
                contentFit="contain"
              />
            </View>
          ) : null}

          {showConfirm ? (
            <TouchableOpacity
              style={[styles.primaryBtn, confirming && { opacity: 0.6 }]}
              onPress={() => void handleConfirmReceipt()}
              disabled={confirming}
            >
              <Text style={styles.primaryBtnText}>
                {confirming ? 'Confirming…' : 'Confirm receipt'}
              </Text>
            </TouchableOpacity>
          ) : null}

          {showDispute ? (
            <TouchableOpacity style={styles.disputeBtn} onPress={handleDispute}>
              <Ionicons name="headset-outline" size={18} color="#333" />
              <Text style={styles.disputeBtnText}>Don&apos;t received?</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8F8FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEE',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  successBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: '#E8F9F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  successBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.success,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  amountCol: {
    flex: 1,
  },
  amountLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
  },
  methodTile: {
    paddingTop: Spacing.sm,
  },
  metaBlock: {
    gap: 6,
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    fontSize: 13,
    color: '#666',
    flex: 1,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#EEE',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  emptyRow: {
    fontSize: 13,
    color: '#999',
  },
  accountRow: {
    gap: 4,
  },
  accountLabel: {
    fontSize: 12,
    color: '#999',
  },
  accountValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  accountValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
    textAlign: 'right',
    flex: 1,
  },
  proofImage: {
    width: '100%',
    height: 220,
    borderRadius: Radius.md,
    backgroundColor: '#F5F5F5',
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  disputeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFF',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#DDD',
    paddingVertical: 14,
  },
  disputeBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
});
