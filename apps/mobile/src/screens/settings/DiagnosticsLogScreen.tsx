import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';

import { Colors, Radius, Spacing } from '@/theme';
import { getApiHost } from '@api/client';
import {
  clearDiagnosticLog,
  isReleaseDiagnosticsEnabled,
  readPersistedDiagnosticLog,
} from '@/diagnostics/releaseDiagnostics';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'DiagnosticsLog'>;

export function DiagnosticsLogScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const log = await readPersistedDiagnosticLog();
      const header = [
        '=== Haka Live diagnostics ===',
        `Enabled: ${isReleaseDiagnosticsEnabled()}`,
        `API host: ${getApiHost()}`,
        `App: ${Constants.expoConfig?.version ?? '?'} (${Constants.nativeBuildVersion ?? '?'})`,
        `Profile: ${process.env.EAS_BUILD_PROFILE ?? 'local'}`,
        '',
        'Native crashes often omit JS logs — use adb logcat on Android.',
        '===========================',
        '',
      ].join('\n');
      setText(log ? `${header}${log}` : `${header}(empty — reproduce issue, then reopen this screen)`);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const onCopy = useCallback(async () => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', 'Diagnostics log copied to clipboard. Paste into Slack/email for support.');
  }, [text]);

  const onClear = useCallback(() => {
    Alert.alert('Clear log?', 'This removes saved diagnostics on this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearDiagnosticLog();
          await reload();
        },
      },
    ]);
  }, [reload]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Diagnostics</Text>
        <TouchableOpacity onPress={() => void reload()} hitSlop={8}>
          <Ionicons name="refresh" size={22} color="#000" />
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>
        Release APK/AAB only. Logs API timeouts, network errors, JS crashes, and session issues.
        Reopen after a crash — the last lines may show the cause.
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => void onCopy()} disabled={!text}>
          <Text style={styles.actionBtnText}>Copy all</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={onClear}>
          <Text style={[styles.actionBtnText, styles.actionBtnDangerText]}>Clear</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={Colors.primary} />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
        >
          <Text style={styles.log} selectable>
            {text}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#000' },
  hint: {
    fontSize: 12,
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  actionBtn: {
    flex: 1,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDanger: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  actionBtnText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  actionBtnDangerText: { color: Colors.danger },
  loader: { marginTop: Spacing.xxl },
  scroll: { flex: 1, paddingHorizontal: Spacing.lg },
  log: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: '#222',
    lineHeight: 16,
  },
});
