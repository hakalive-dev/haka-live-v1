import React, { useCallback, useRef, useState } from 'react';
import Constants from 'expo-constants';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch } from 'react-redux';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { Colors, Radius, Spacing } from '@/theme';
import { settingsApi, AccountSecurity } from '@api/settings';
import { isReleaseDiagnosticsEnabled } from '@/diagnostics/releaseDiagnostics';
import { clearAuth } from '@store/authSlice';
import { clearWallet } from '@store/walletSlice';
import { TokenStorage } from '../../storage';
import type { RootStackScreenProps } from '@navigation/types';
import type { AppDispatch } from '@store/index';

type Props = RootStackScreenProps<'Settings'>;

const SECURITY_COLORS: Record<string, string> = {
  low: '#FF4D4D',
  medium: '#E8A020',
  high: '#22C97A',
};

export function SettingsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch<AppDispatch>();
  const { t } = useTranslation();
  const [security, setSecurity] = useState<AccountSecurity | null>(null);
  const versionTapCount = useRef(0);

  useFocusEffect(
    useCallback(() => {
      settingsApi.getAccountSecurity().then(setSecurity).catch(() => {});
    }, []),
  );

  const securityLevel = security?.security_level ?? 'low';
  const securityColor = SECURITY_COLORS[securityLevel] ?? '#FF4D4D';

  // `id` is the stable branch key; `label` is translated for display only.
  const menuItems = [
    { id: 'accountSecurity', label: t('settings.accountAndSecurity'), subtitle: t('settings.securityLevel', { level: t(`securityLevels.${securityLevel}`) }), subtitleColor: securityColor, route: 'AccountSecurity' },
    { id: 'securityPassword', label: t('settings.securityPassword'), route: 'AccountSecurity' },
    { id: 'languageSetting', label: t('settings.languageSetting'), route: 'LanguageSetting' },
    { id: 'blocklist', label: t('settings.blocklist'), route: 'Blocklist' },
    { id: 'privilegeSetting', label: t('settings.privilegeSetting'), route: 'PrivilegeSetting' },
    { id: 'newMessages', label: t('settings.newMessagesNotification'), route: 'NewMessageNotification' },
    { id: 'privacy', label: t('settings.privacy'), route: 'PrivacySetting' },
    { id: 'version', label: t('settings.version') },
    { id: 'about', label: t('settings.aboutHaka') },
    { id: 'clearCache', label: t('settings.clearCache') },
  ];

  const handleLogout = useCallback(() => {
    Alert.alert(t('settings.logoutConfirmTitle'), t('settings.logoutConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.logoutConfirmButton'),
        style: 'destructive',
        onPress: async () => {
          await TokenStorage.clear();
          dispatch(clearAuth());
          dispatch(clearWallet());
        },
      },
    ]);
  }, [dispatch, t]);

  const handlePress = useCallback(
    (item: typeof menuItems[0]) => {
      if (item.route) {
        navigation.navigate(item.route as any);
      } else if (item.id === 'clearCache') {
        Alert.alert(t('common.cacheCleared'), t('common.cacheClearedMessage'));
      } else if (item.id === 'version') {
        if (isReleaseDiagnosticsEnabled()) {
          versionTapCount.current += 1;
          if (versionTapCount.current >= 5) {
            versionTapCount.current = 0;
            navigation.navigate('DiagnosticsLog');
            return;
          }
        }
        const v = Constants.expoConfig?.version ?? '1.0.0';
        const hint = isReleaseDiagnosticsEnabled()
          ? t('settings.diagnosticsHint', { count: 5 - versionTapCount.current })
          : '';
        Alert.alert(t('settings.version'), `${t('settings.versionValue', { version: v })}${hint}`);
      }
    },
    [navigation, t],
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('settings.title')}</Text>
        <TouchableOpacity hitSlop={8}>
          <Ionicons name="create-outline" size={22} color="#000" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      >
        {menuItems.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={styles.menuRow}
            onPress={() => handlePress(item)}
            activeOpacity={0.7}
          >
            <View style={styles.menuTextCol}>
              <Text style={styles.menuLabel}>{item.label}</Text>
              {item.subtitle && (
                <Text style={[styles.menuSubtitle, { color: item.subtitleColor ?? '#999' }]}>
                  {item.subtitle}
                </Text>
              )}
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={item.subtitleColor ?? '#CCC'}
            />
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>{t('settings.logout')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#000' },
  menuRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg,
    borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  menuTextCol: { flex: 1, gap: 2 },
  menuLabel: { fontSize: 14, fontWeight: '500', color: '#000' },
  menuSubtitle: { fontSize: 11 },
  logoutBtn: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.xxl, height: 48,
    borderRadius: Radius.md, borderWidth: 1, borderColor: '#FF4D4D',
    alignItems: 'center', justifyContent: 'center',
  },
  logoutText: { fontSize: 15, fontWeight: '600', color: '#FF4D4D' },
});
