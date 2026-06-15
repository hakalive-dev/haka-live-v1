import React, { useEffect, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Colors, Radius, Spacing } from '@/theme';
import { appConfigApi, type PlatformUpdateConfig } from '../api/appConfig';
import { TokenStorage } from '../storage';

type GateKind = 'forced' | 'optional';

/** The running build's versionCode (Android) — NaN on platforms/builds without one. */
function currentVersionCode(): number {
  return Number(Constants.nativeBuildVersion);
}

/**
 * Launch-time "Update available" gate. Compares the running build against the
 * backend's published version config and, when behind, overlays a modal:
 *  - below `min_supported_version_code` → forced, non-dismissible.
 *  - below `latest_version_code`        → optional, dismissible once per version.
 *
 * Fails open: non-Android, dev builds, missing versionCode, or any fetch error
 * render nothing so a tester is never trapped behind the gate.
 */
export function AppUpdateGate() {
  // Optional-update nag is throttled per versionCode; null until we've read storage.
  const [dismissedVersion, setDismissedVersion] = useState<number | null>(null);

  const enabled = Platform.OS === 'android' && !__DEV__;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    TokenStorage.getDismissedUpdateVersion().then((v) => {
      if (!cancelled) setDismissedVersion(v);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const { data } = useQuery({
    queryKey: ['app-config'],
    queryFn: appConfigApi.getConfig,
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const cfg: PlatformUpdateConfig | undefined =
    Platform.OS === 'android' ? data?.android : undefined;

  if (!enabled || !cfg || dismissedVersion === null) return null;

  const current = currentVersionCode();
  if (!Number.isFinite(current)) return null;

  let kind: GateKind | null = null;
  if (cfg.min_supported_version_code > 0 && current < cfg.min_supported_version_code) {
    kind = 'forced';
  } else if (
    cfg.latest_version_code > 0 &&
    current < cfg.latest_version_code &&
    dismissedVersion < cfg.latest_version_code
  ) {
    kind = 'optional';
  }

  if (!kind) return null;

  return <UpdateModal kind={kind} cfg={cfg} onDismiss={setDismissedVersion} />;
}

function UpdateModal({
  kind,
  cfg,
  onDismiss,
}: {
  kind: GateKind;
  cfg: PlatformUpdateConfig;
  onDismiss: (version: number) => void;
}) {
  const { t } = useTranslation();
  const isForced = kind === 'forced';

  const dismiss = () => {
    // Remember so the optional nag doesn't reappear for this version next launch.
    void TokenStorage.setDismissedUpdateVersion(cfg.latest_version_code);
    onDismiss(cfg.latest_version_code);
  };

  const openStore = () => {
    void Linking.openURL(cfg.store_url);
    // Forced updates stay up until the user actually relaunches on a new build.
    if (!isForced) dismiss();
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      // Android back button: ignored while forced, dismisses an optional prompt.
      onRequestClose={isForced ? () => {} : dismiss}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>
            {t(isForced ? 'appUpdate.requiredTitle' : 'appUpdate.availableTitle')}
          </Text>
          <Text style={styles.subtitle}>
            {t(isForced ? 'appUpdate.requiredMessage' : 'appUpdate.availableMessage')}
          </Text>

          {cfg.release_notes.length > 0 && (
            <ScrollView style={styles.notes} contentContainerStyle={styles.notesContent}>
              {cfg.release_notes.map((note, i) => (
                <View key={i} style={styles.noteRow}>
                  <Text style={styles.noteBullet}>•</Text>
                  <Text style={styles.noteText}>{note}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            onPress={openStore}
          >
            <Text style={styles.primaryBtnText}>{t('appUpdate.updateNow')}</Text>
          </Pressable>

          {!isForced && (
            <Pressable
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
              onPress={dismiss}
            >
              <Text style={styles.secondaryBtnText}>{t('appUpdate.later')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  notes: {
    maxHeight: 180,
    marginBottom: Spacing.lg,
  },
  notesContent: {
    paddingRight: Spacing.sm,
  },
  noteRow: {
    flexDirection: 'row',
    marginBottom: Spacing.xs,
  },
  noteBullet: {
    color: Colors.primary,
    fontSize: 14,
    lineHeight: 20,
    marginRight: Spacing.sm,
  },
  noteText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textPrimary,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: Colors.textInverse,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  secondaryBtnText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.85,
  },
});
