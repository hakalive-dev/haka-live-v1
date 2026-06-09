import React, { useCallback, useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing } from '@/theme';
import { ListRowSkeleton } from '@components/Skeleton';
import { settingsApi, UserSettings } from '@api/settings';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'PrivilegeSetting'>;

const PRIVILEGE_ITEMS: Array<{ label: string; description: string; key: keyof UserSettings }> = [
  {
    label: 'Invisible visitor',
    description: 'Your profile visits will not be visible to other users.',
    key: 'invisible_visitor',
  },
  {
    label: 'Mystery man in LIVE room',
    description: 'Your identity will be hidden when joining live rooms.',
    key: 'mystery_man_live',
  },
  {
    label: 'Mystery man on rank',
    description: 'Your name will be hidden on leaderboard rankings.',
    key: 'mystery_man_rank',
  },
  {
    label: 'Invisible Online',
    description: 'Your online status will not be shown to other users.',
    key: 'invisible_online',
  },
  {
    label: 'Exclusive Email Notification',
    description: 'Receive exclusive notifications and updates via email.',
    key: 'exclusive_email_notification',
  },
  {
    label: 'Hide livestream level',
    description: 'Your level badge will not be displayed during live streams.',
    key: 'hide_livestream_level',
  },
];

export function PrivilegeSettingScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    settingsApi.getSettings()
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const update = useCallback(async (patch: Partial<UserSettings>) => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    try {
      const updated = await settingsApi.updateSettings(patch);
      setSettings(updated);
    } catch {
      const fresh = await settingsApi.getSettings();
      setSettings(fresh);
    }
  }, []);

  if (loading || !settings) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ListRowSkeleton rows={6} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privilege setting</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      >
        {PRIVILEGE_ITEMS.map((item) => (
          <View key={item.key} style={styles.itemRow}>
            <View style={styles.itemTextCol}>
              <Text style={styles.itemLabel}>{item.label}</Text>
              <Text style={styles.itemDesc}>{item.description}</Text>
            </View>
            <Switch
              value={Boolean(settings[item.key])}
              onValueChange={(v) => update({ [item.key]: v } as Partial<UserSettings>)}
              trackColor={{ false: '#E0E0E0', true: '#22C97A' }}
              thumbColor="#FFF"
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: '#000', textAlign: 'center' },
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg,
    borderBottomWidth: 1, borderBottomColor: '#F5F5F5', gap: Spacing.md,
  },
  itemTextCol: { flex: 1, gap: Spacing.xs },
  itemLabel: { fontSize: 14, fontWeight: '500', color: '#000' },
  itemDesc: { fontSize: 11, color: '#999', lineHeight: 16 },
});
