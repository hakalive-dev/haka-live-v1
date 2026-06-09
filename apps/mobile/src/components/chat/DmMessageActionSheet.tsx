import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Radius, Spacing } from '@/theme';
import type { DmActionAvailability, DmMessageActionKey } from '@/utils/dmMessageActions';

type ActionRow = {
  key: DmMessageActionKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
};

const ACTIONS: ActionRow[] = [
  { key: 'copy', label: 'Copy', icon: 'copy-outline' },
  { key: 'forward', label: 'Forward', icon: 'arrow-redo-outline' },
  { key: 'delete', label: 'Delete', icon: 'trash-outline', destructive: true },
  { key: 'report', label: 'Report', icon: 'flag-outline', destructive: true },
];

type Props = {
  visible: boolean;
  availability: DmActionAvailability;
  onClose: () => void;
  onSelect: (action: DmMessageActionKey) => void;
};

export function DmMessageActionSheet({ visible, availability, onClose, onSelect }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.card, { paddingBottom: insets.bottom + Spacing.lg }]}
          onPress={(e) => e.stopPropagation()}
        >
          {ACTIONS.filter((row) => availability[row.key]).map((row) => (
            <TouchableOpacity
              key={row.key}
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => onSelect(row.key)}
            >
              <Ionicons
                name={row.icon}
                size={22}
                color={row.destructive ? Colors.danger : Colors.textPrimary}
              />
              <Text style={[styles.rowLabel, row.destructive && styles.destructiveLabel]}>
                {row.label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.cancelRow} activeOpacity={0.7} onPress={onClose}>
            <Text style={styles.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  destructiveLabel: {
    color: Colors.danger,
  },
  cancelRow: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    marginTop: Spacing.xs,
  },
  cancelLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
});
