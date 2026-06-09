import React, { useCallback, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { familyApi } from '@api/family';
import { Colors, Radius, Spacing } from '@/theme';
import { KeyboardAwareScroll } from '@components/keyboard';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'CreateFamily'>;

const BADGE_OPTIONS = ['🏠', '🐉', '🔥', '⚡', '🌟', '🌊', '🎵', '🎮', '💎', '🦁', '🌸', '🚀'];

export function CreateFamilyScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName]           = useState('');
  const [description, setDesc]    = useState('');
  const [badgeIcon, setBadgeIcon] = useState('🏠');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Missing Name', 'Please enter a family name.');
      return;
    }
    setSubmitting(true);
    try {
      await familyApi.create({ name: trimmedName, announcement: description.trim() });
      Alert.alert('Family Created!', `"${trimmedName}" is ready. Invite members to grow your family.`, [
        { text: 'OK', onPress: () => navigation.replace('FamilyHub') },
      ]);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Please try again');
    } finally {
      setSubmitting(false);
    }
  }, [name, description, badgeIcon, navigation]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Family</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScroll
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
      >
        {/* Badge preview */}
        <View style={styles.previewRow}>
          <View style={styles.previewBadge}>
            <Text style={styles.previewEmoji}>{badgeIcon}</Text>
          </View>
          <Text style={styles.previewName}>{name || 'Your Family Name'}</Text>
        </View>

        {/* Badge picker */}
        <Text style={styles.label}>Choose Icon</Text>
        <View style={styles.badgeGrid}>
          {BADGE_OPTIONS.map((icon) => (
            <TouchableOpacity
              key={icon}
              style={[styles.badgeOption, badgeIcon === icon && styles.badgeOptionActive]}
              onPress={() => setBadgeIcon(icon)}
            >
              <Text style={styles.badgeEmoji}>{icon}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Name */}
        <Text style={styles.label}>Family Name *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Dragon Squad"
          placeholderTextColor={Colors.textTertiary}
          maxLength={50}
          autoCapitalize="words"
        />
        <Text style={styles.charCount}>{name.length}/50</Text>

        {/* Description */}
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.inputMulti]}
          value={description}
          onChangeText={setDesc}
          placeholder="What's your family about?"
          placeholderTextColor={Colors.textTertiary}
          maxLength={200}
          multiline
          numberOfLines={3}
        />
        <Text style={styles.charCount}>{description.length}/200</Text>

        {/* Tier info */}
        <View style={styles.tierInfoBox}>
          <Ionicons name="information-circle" size={18} color={Colors.info} />
          <View style={{ flex: 1 }}>
            <Text style={styles.tierInfoTitle}>Family Tiers</Text>
            <Text style={styles.tierInfoText}>
              Bronze → Silver at 100,000 pts · Silver → Gold at 500,000 pts.
              Points are earned when members send gifts.
            </Text>
          </View>
        </View>
      </KeyboardAwareScroll>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <TouchableOpacity
          style={[styles.createBtn, (!name.trim() || submitting) && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={!name.trim() || submitting}
        >
          <>
              <Ionicons name="add-circle" size={18} color="#FFFFFF" />
              <Text style={styles.createBtnText}>Create Family</Text>
            </>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, color: Colors.textPrimary, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  scroll: { padding: Spacing.lg, gap: Spacing.md },

  previewRow: { alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  previewBadge: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.surface, borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  previewEmoji: { fontSize: 40 },
  previewName: { color: Colors.textPrimary, fontSize: 20, fontWeight: '700' },

  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  badgeOption: {
    width: 52, height: 52, borderRadius: Radius.md,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySubtle },
  badgeEmoji: { fontSize: 26 },

  label: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: Spacing.sm },
  input: {
    backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, height: 52, paddingHorizontal: Spacing.md,
    color: Colors.textPrimary, fontSize: 15,
  },
  inputMulti: { height: 88, paddingTop: Spacing.md, textAlignVertical: 'top' },
  charCount: { color: Colors.textTertiary, fontSize: 11, textAlign: 'right' },

  tierInfoBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#4DA6FF18', borderRadius: Radius.md,
    padding: Spacing.md, gap: Spacing.sm, marginTop: Spacing.sm,
  },
  tierInfoTitle: { color: Colors.info, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  tierInfoText:  { color: Colors.textSecondary, fontSize: 12, lineHeight: 18 },

  footer: {
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  createBtn: {
    height: 52, backgroundColor: Colors.primary, borderRadius: Radius.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
