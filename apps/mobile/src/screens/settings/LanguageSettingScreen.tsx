import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { Colors, Spacing } from '@/theme';
import { ListRowSkeleton } from '@components/Skeleton';
import { settingsApi } from '@api/settings';
import { LANGUAGES } from '@/i18n/languages';
import { applyLanguageFromSettings } from '@/i18n/applyLanguage';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'LanguageSetting'>;

export function LanguageSettingScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [useSystemLang, setUseSystemLang] = useState(true);
  const [selectedLang, setSelectedLang] = useState('English');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsApi.getSettings().then((s) => {
      setUseSystemLang(s.use_system_language);
      if (s.language) setSelectedLang(s.language);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleConfirm = useCallback(async () => {
    setSaving(true);
    try {
      const payload = {
        use_system_language: useSystemLang,
        language: useSystemLang ? '' : selectedLang,
      };
      await settingsApi.updateSettings(payload);
      // Apply immediately so the UI re-renders in the chosen language now.
      await applyLanguageFromSettings(payload);
      Alert.alert(
        t('language.savedTitle'),
        t('language.savedMessage', {
          lang: useSystemLang ? t('language.systemName') : selectedLang,
        }),
      );
      navigation.goBack();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : t('language.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [useSystemLang, selectedLang, navigation, t]);

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ListRowSkeleton rows={8} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('language.title')}</Text>
        <TouchableOpacity onPress={handleConfirm} hitSlop={8} disabled={saving}>
          <Text style={styles.confirmText}>{t('common.confirm')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      >
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('language.systemLanguage')}</Text>
          <Switch
            value={useSystemLang}
            onValueChange={setUseSystemLang}
            trackColor={{ false: '#E0E0E0', true: '#22C97A' }}
            thumbColor="#FFF"
          />
        </View>
        {LANGUAGES.map(({ name }) => (
          <View key={name} style={styles.row}>
            <Text style={styles.rowLabel}>{name}</Text>
            <Switch
              value={!useSystemLang && selectedLang === name}
              onValueChange={() => { setUseSystemLang(false); setSelectedLang(name); }}
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
  confirmText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  rowLabel: { fontSize: 14, fontWeight: '500', color: '#000' },
});
