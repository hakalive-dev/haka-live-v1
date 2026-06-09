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

type Props = RootStackScreenProps<'PrivacySetting'>;

const PRIVACY_ITEMS: Array<{ label: string; description: string; key: keyof UserSettings }> = [
  {
    label: 'Allow Haka to access your camera',
    description: 'Required for live streaming, video calls, and profile photo capture.',
    key: 'camera_access',
  },
  {
    label: 'Allow Haka to access your voice memo',
    description: 'Required for voice rooms, live audio streaming, and voice messages.',
    key: 'voice_access',
  },
  {
    label: 'Allow Haka to access your location',
    description: 'Used for nearby user discovery and location-based recommendations.',
    key: 'location_access',
  },
];

export function PrivacyScreen({ navigation }: Props) {
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
        <ListRowSkeleton rows={3} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      >
        {PRIVACY_ITEMS.map((item) => (
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
