import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StateSubdivision } from '@haka-live/shared-types/state-rankings';
import { Colors, Spacing, Radius } from '@/theme';

type Props = {
  visible: boolean;
  states: StateSubdivision[];
  selectedCode: string;
  onSelect: (code: string, name: string) => void;
  onClose: () => void;
  title?: string;
};

export function StatePickerModal({
  visible,
  states,
  selectedCode,
  onSelect,
  onClose,
  title = 'Select state',
}: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return states;
    return states.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q),
    );
  }, [search, states]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          <View style={{ width: 24 }} />
        </View>

        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search state…"
          placeholderTextColor={Colors.textTertiary}
          autoCapitalize="none"
        />

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.code}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const active = item.code === selectedCode;
            return (
              <Pressable
                style={[styles.row, active && styles.rowActive]}
                onPress={() => {
                  onSelect(item.code, item.name);
                  onClose();
                }}
              >
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowCode}>{item.code}</Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>No states match your search</Text>}
        />
      </View>
    </Modal>
  );
}

type FieldProps = {
  label: string;
  value: string;
  displayName: string;
  onPress: () => void;
  disabled?: boolean;
  hint?: string;
};

export function StatePickerField({
  label,
  value,
  displayName,
  onPress,
  disabled,
  hint,
}: FieldProps) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TouchableOpacity
        style={[styles.field, disabled && styles.fieldDisabled]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <Text style={[styles.fieldText, !displayName && styles.fieldPlaceholder]}>
          {displayName || 'Select state'}
        </Text>
        {!disabled ? (
          <Ionicons name="chevron-down" size={18} color={Colors.textSecondary} />
        ) : null}
      </TouchableOpacity>
      {value && !disabled ? (
        <Text style={styles.hint}>Code: {value}</Text>
      ) : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface, paddingTop: Spacing.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  title: { flex: 1, textAlign: 'center', color: Colors.textPrimary, fontWeight: '700', fontSize: 17 },
  search: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rowActive: { backgroundColor: Colors.primarySubtle },
  rowName: { color: Colors.textPrimary, fontSize: 15, flex: 1 },
  rowCode: { color: Colors.textTertiary, fontSize: 12, fontWeight: '600' },
  empty: { color: Colors.textTertiary, textAlign: 'center', padding: Spacing.xl },
  fieldLabel: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: Spacing.md,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginTop: Spacing.xs,
  },
  fieldDisabled: { opacity: 0.55 },
  fieldText: { color: Colors.textPrimary, fontSize: 15 },
  fieldPlaceholder: { color: Colors.textTertiary },
  hint: { color: Colors.textTertiary, fontSize: 12, marginTop: Spacing.xs },
});
