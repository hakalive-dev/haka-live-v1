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

type Props = RootStackScreenProps<'NewMessageNotification'>;

export function NewMessageNotificationScreen({ navigation }: Props) {
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
      // Revert on error — refetch
      const fresh = await settingsApi.getSettings();
      setSettings(fresh);
    }
  }, []);

  if (loading || !settings) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ListRowSkeleton rows={4} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Message Notification</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      >
        <Text style={styles.sectionTitle}>Message notifications</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Live room opening alerts</Text>
          <Switch
            value={settings.live_room_alerts}
            onValueChange={(v) => update({ live_room_alerts: v })}
            trackColor={{ false: '#E0E0E0', true: '#22C97A' }}
            thumbColor="#FFF"
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Message notification Switch</Text>
          <Switch
            value={settings.message_notifications}
            onValueChange={(v) => update({ message_notifications: v })}
            trackColor={{ false: '#E0E0E0', true: '#22C97A' }}
            thumbColor="#FFF"
          />
        </View>

        <Text style={styles.sectionTitle}>Message alert settings</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Sound</Text>
          <Switch
            value={settings.sound_enabled}
            onValueChange={(v) => update({ sound_enabled: v })}
            trackColor={{ false: '#E0E0E0', true: '#22C97A' }}
            thumbColor="#FFF"
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Vibrate</Text>
          <Switch
            value={settings.vibrate_enabled}
            onValueChange={(v) => update({ vibrate_enabled: v })}
            trackColor={{ false: '#E0E0E0', true: '#22C97A' }}
            thumbColor="#FFF"
          />
        </View>

        <Text style={styles.sectionTitle}>Who can send me a private message</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Mutual followers</Text>
          <Switch
            value={settings.who_can_message === 'mutual'}
            onValueChange={() => update({ who_can_message: 'mutual' })}
            trackColor={{ false: '#E0E0E0', true: '#22C97A' }}
            thumbColor="#FFF"
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>My following</Text>
          <Switch
            value={settings.who_can_message === 'following'}
            onValueChange={() => update({ who_can_message: 'following' })}
            trackColor={{ false: '#E0E0E0', true: '#22C97A' }}
            thumbColor="#FFF"
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Everyone</Text>
          <Switch
            value={settings.who_can_message === 'everyone'}
            onValueChange={() => update({ who_can_message: 'everyone' })}
            trackColor={{ false: '#E0E0E0', true: '#22C97A' }}
            thumbColor="#FFF"
          />
        </View>
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
  sectionTitle: {
    fontSize: 13, fontWeight: '600', color: '#999',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  rowLabel: { fontSize: 14, fontWeight: '500', color: '#000' },
});
