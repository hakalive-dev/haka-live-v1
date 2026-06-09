import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { paymentsApi } from '@api/payments';
import { Colors, Radius, Spacing } from '@/theme';
import { DetailSkeleton } from '@components/Skeleton';
import { CopyIcon } from '@components/CopyIcon';
import type { ManualPaymentRequest } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'ManualPaymentConfirm'>;

const STATUS_COLORS: Record<string, string> = {
  pending: '#E8A020',
  confirmed: '#22C97A',
  rejected: '#FF4D4D',
  expired: '#999',
};

export function ManualPaymentConfirmScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { requestId } = route.params;
  const [request, setRequest] = useState<ManualPaymentRequest | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const req = await paymentsApi.getManualTopUpDetail(requestId);
      setRequest(req);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => { load(); }, [load]);

  const copyToClipboard = useCallback(async (text: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', 'Copied to clipboard');
  }, []);

  if (loading || !request) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <DetailSkeleton />
      </View>
    );
  }

  const methodLabel = request.method.toUpperCase();
  const isCrypto = request.method === 'usdt' || request.method === 'usdc';

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment Request</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        {/* Status */}
        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[request.status] ?? '#999' }]}>
          <Text style={styles.statusText}>{request.status.toUpperCase()}</Text>
        </View>

        {/* Reference */}
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Reference ID</Text>
          <TouchableOpacity
            style={styles.refRow}
            onPress={() => copyToClipboard(request.reference_id)}
          >
            <Text style={styles.refText}>{request.reference_id}</Text>
            <CopyIcon size={18} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Details */}
        <View style={styles.infoCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Method</Text>
            <Text style={styles.detailValue}>{methodLabel}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Package</Text>
            <Text style={styles.detailValue}>{request.package.name}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Coins</Text>
            <Text style={styles.detailValue}>{request.package.total_coins.toLocaleString()}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Amount</Text>
            <Text style={styles.detailValue}>{request.currency_code} {request.amount_local}</Text>
          </View>
        </View>

        {/* Crypto wallet address */}
        {isCrypto && request.crypto_wallet && (
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>
              Send {request.method.toUpperCase()} to this {request.crypto_wallet.network} address:
            </Text>
            <TouchableOpacity
              style={styles.walletRow}
              onPress={() => copyToClipboard(request.crypto_wallet!.wallet_address)}
            >
              <Text style={styles.walletAddr} numberOfLines={1}>
                {request.crypto_wallet.wallet_address}
              </Text>
              <CopyIcon size={18} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Instructions */}
        <View style={styles.instructionCard}>
          <Ionicons name="information-circle" size={20} color={Colors.primary} />
          <Text style={styles.instructionText}>
            {isCrypto
              ? 'Send the exact amount to the wallet address above. Your coins will be credited once the transaction is confirmed by our team.'
              : `Complete the payment of ${request.currency_code} ${request.amount_local} using ${methodLabel}. Use the reference ID above for tracking. Coins will be credited once payment is verified.`
            }
          </Text>
        </View>

        {/* Refresh button */}
        <TouchableOpacity style={styles.refreshBtn} onPress={load}>
          <Ionicons name="refresh" size={18} color={Colors.primary} />
          <Text style={styles.refreshText}>Refresh Status</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  content: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
    alignItems: 'center',
  },
  statusBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  infoCard: {
    width: '100%',
    backgroundColor: '#F8F8F8',
    borderRadius: Radius.md,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#999',
  },
  refRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  refText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    letterSpacing: 1,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  walletAddr: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#000',
    fontFamily: 'monospace',
  },
  instructionCard: {
    width: '100%',
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: 'rgba(123,79,255,0.08)',
    borderRadius: Radius.md,
    padding: Spacing.lg,
  },
  instructionText: {
    flex: 1,
    fontSize: 13,
    color: '#444',
    lineHeight: 20,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.md,
  },
  refreshText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
});
