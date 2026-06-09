import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { Colors, Radius, Spacing } from '@/theme';
import { ListRowSkeleton } from '@components/Skeleton';
import { settingsApi, DeviceEntry } from '@api/settings';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'DeviceManagement'>;

const PLATFORM_ICON: Record<string, string> = {
  ios: 'logo-apple',
  android: 'logo-android',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function DeviceManagementScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [devices, setDevices] = useState<DeviceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    settingsApi.getDevices()
      .then(setDevices)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(load);

  const handleRemove = useCallback((device: DeviceEntry) => {
    Alert.alert(
      'Remove Device',
      `Remove "${device.deviceModel || device.deviceId}" from your trusted devices?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemoving(device.id);
            try {
              await settingsApi.removeDevice(device.deviceId);
              setDevices((prev) => prev.filter((d) => d.id !== device.id));
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed to remove device.');
            } finally {
              setRemoving(null);
            }
          },
        },
      ],
    );
  }, []);

  const renderItem = useCallback(({ item }: { item: DeviceEntry }) => {
    const icon = PLATFORM_ICON[item.platform] ?? 'phone-portrait-outline';
    const isRemoving = removing === item.id;
    return (
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon as any} size={22} color={Colors.primary} />
        </View>
        <View style={styles.rowInfo}>
          <Text style={styles.rowModel} numberOfLines={1}>
            {item.deviceModel || 'Unknown device'}
          </Text>
          <Text style={styles.rowSub}>
            {item.platform ? item.platform.charAt(0).toUpperCase() + item.platform.slice(1) : ''}
            {item.appVersion ? `  ·  v${item.appVersion}` : ''}
          </Text>
          <Text style={styles.rowDate}>Last login {formatDate(item.lastLoginAt)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.removeBtn, isRemoving && { opacity: 0.4 }]}
          onPress={() => handleRemove(item)}
          disabled={isRemoving}
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={18} color={Colors.danger} />
        </TouchableOpacity>
      </View>
    );
  }, [removing, handleRemove]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Device Management</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ListRowSkeleton rows={4} />
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="phone-portrait-outline" size={48} color="#CCC" />
              <Text style={styles.emptyText}>No devices registered</Text>
            </View>
          }
        />
      )}
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

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: '#F5F5F5', gap: Spacing.md,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: '#F3EFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  rowInfo: { flex: 1 },
  rowModel: { fontSize: 14, fontWeight: '600', color: '#000' },
  rowSub: { fontSize: 12, color: '#888', marginTop: 2 },
  rowDate: { fontSize: 11, color: '#AAA', marginTop: 2 },
  removeBtn: { padding: 4 },

  empty: { alignItems: 'center', paddingVertical: 60, gap: Spacing.sm },
  emptyText: { fontSize: 14, color: '#BBB' },
});
