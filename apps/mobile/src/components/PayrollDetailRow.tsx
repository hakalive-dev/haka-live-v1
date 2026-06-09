import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { CopyIcon } from './CopyIcon';
import { Colors, Spacing } from '@/theme';

type Props = {
  label: string;
  value: string;
  copyable?: boolean;
  /** When set, clipboard receives this while `value` is shown in the UI. */
  copyValue?: string;
};

export function PayrollDetailRow({ label, value, copyable = true, copyValue }: Props) {
  const display = value?.trim() ? value : '—';
  const clipboardText = copyValue?.trim() || value?.trim();
  const canCopy = copyable && !!clipboardText;

  return (
    <View style={styles.row}>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
      <View style={styles.valueCol}>
        <Text style={styles.value} numberOfLines={3}>
          {display}
        </Text>
        {canCopy ? (
          <TouchableOpacity
            hitSlop={8}
            style={styles.copyBtn}
            onPress={async () => {
              await Clipboard.setStringAsync(clipboardText!);
              Alert.alert('Copied', `${label} copied to clipboard`);
            }}
          >
            <CopyIcon size={14} color={Colors.textTertiary} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  label: {
    flex: 0.42,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  valueCol: {
    flex: 0.58,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    gap: Spacing.xs,
  },
  value: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textPrimary,
    textAlign: 'right',
  },
  copyBtn: {
    paddingTop: 2,
  },
});
