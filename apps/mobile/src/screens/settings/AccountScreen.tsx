import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect } from '@react-navigation/native';
import { consumePendingPasswordReveal } from '../../utils/accountPasswordStorage';
import { saveAccountCardToAlbum, showSaveAlbumError } from '../../utils/saveAccountCardToAlbum';
import { useDispatch, useSelector } from 'react-redux';

import { Colors, Radius, Spacing } from '@/theme';
import { CopyIcon } from '@components/CopyIcon';
import { ListRowSkeleton } from '@components/Skeleton';
import { UserAvatar } from '@components/UserAvatar';
import { authApi } from '@api/auth';
import { settingsApi, AccountSecurity } from '@api/settings';
import { setUser } from '@store/authSlice';
import { HAKA_LOGO_MARK } from '@/constants/app-logo';
import type { RootStackScreenProps } from '@navigation/types';
import type { AppDispatch, RootState } from '@store/index';

type Props = RootStackScreenProps<'Account'>;

const LOGIN_WITH_PASSWORD_KEY = 'account_login_with_password';

async function getLoginWithPasswordPref(hasPassword: boolean): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(LOGIN_WITH_PASSWORD_KEY);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return hasPassword;
}

async function setLoginWithPasswordPref(value: boolean): Promise<void> {
  await SecureStore.setItemAsync(LOGIN_WITH_PASSWORD_KEY, value ? 'true' : 'false');
}

function copyWithFeedback(text: string) {
  if (!text) return;
  void Clipboard.setStringAsync(text).then(() => {
    if (Platform.OS === 'android') {
      ToastAndroid.show('Copied', ToastAndroid.SHORT);
    } else {
      Alert.alert('Copied', 'Copied to clipboard');
    }
  });
}

type InfoRowProps = {
  label: string;
  value: string;
  onCopy?: () => void;
  footer?: React.ReactNode;
};

function InfoRow({ label, value, onCopy, footer }: InfoRowProps) {
  return (
    <View style={styles.infoRowWrap}>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>{label}</Text>
        <View style={styles.infoValueCol}>
          <Text style={styles.infoValue} numberOfLines={1}>
            {value}
          </Text>
          {onCopy ? (
            <TouchableOpacity onPress={onCopy} hitSlop={8} style={styles.copyBtn}>
              <CopyIcon size={16} color={Colors.textTertiary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      {footer}
    </View>
  );
}

export function AccountScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch<AppDispatch>();
  const authUser = useSelector((state: RootState) => state.auth.user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [security, setSecurity] = useState<AccountSecurity | null>(null);
  const [loginWithPassword, setLoginWithPassword] = useState(false);
  const [savingAlbum, setSavingAlbum] = useState(false);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const cardRef = useRef<View>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [me, sec] = await Promise.all([
        authApi.getMe(),
        settingsApi.getAccountSecurity(),
      ]);
      dispatch(setUser(me));
      setSecurity(sec);
      setLoginWithPassword(await getLoginWithPasswordPref(!!me.hasPassword));
      const pending = consumePendingPasswordReveal(me.id);
      setRevealedPassword(pending);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load account');
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const handleToggleLoginPassword = useCallback(async (value: boolean) => {
    setLoginWithPassword(value);
    await setLoginWithPasswordPref(value);
  }, []);

  const displayName = authUser?.displayName || authUser?.username || 'Haka';
  const hakaId = authUser?.hakaId ?? '';
  const phone = authUser?.phone ?? '';
  const email = authUser?.email ?? '';
  const hasPassword = !!authUser?.hasPassword;
  const passwordDisplay = revealedPassword ?? (hasPassword ? '••••••' : 'Not set');
  const canCopyPassword = !!revealedPassword;
  const securityPasswordLabel = security?.has_password ? 'Enabled >' : 'Not set >';

  const handleSaveToAlbum = useCallback(async () => {
    if (savingAlbum) return;
    setSavingAlbum(true);
    try {
      await saveAccountCardToAlbum(cardRef);
      if (Platform.OS === 'android') {
        ToastAndroid.show('Saved to album', ToastAndroid.SHORT);
      } else {
        Alert.alert('Saved', 'Account card saved to your photo library.');
      }
    } catch (e: unknown) {
      showSaveAlbumError(e);
    } finally {
      setSavingAlbum(false);
    }
  }, [savingAlbum]);

  if (loading && !authUser) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Account</Text>
          <View style={styles.headerSpacer} />
        </View>
        <ListRowSkeleton rows={8} />
      </View>
    );
  }

  if (error && !authUser) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Account</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void loadData()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
      >
        <View style={styles.infoCard}>
          <View ref={cardRef} collapsable={false} style={styles.cardCapture}>
          <LinearGradient
            colors={['#7DEF9A', '#D8F9E2', '#FFFFFF']}
            locations={[0, 0.45, 1]}
            style={styles.cardGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          >
            <View style={styles.brandRow}>
              <View style={styles.brandLeft}>
                <View style={styles.logoClip}>
                  <Image
                    source={HAKA_LOGO_MARK}
                    style={styles.logo}
                    contentFit="cover"
                  />
                </View>
                <Text style={styles.brandName} numberOfLines={1}>
                  {displayName}
                </Text>
              </View>
              {authUser ? (
                <UserAvatar user={authUser} size={48} hideFrame />
              ) : null}
            </View>
          </LinearGradient>

          <Text style={styles.sectionTitle}>Account Information</Text>

          <InfoRow
            label="ID"
            value={hakaId || '—'}
            onCopy={() => copyWithFeedback(hakaId)}
          />
          <View style={styles.divider} />
          <InfoRow
            label="Password"
            value={passwordDisplay}
            onCopy={canCopyPassword ? () => copyWithFeedback(revealedPassword!) : undefined}
            footer={
              <TouchableOpacity
                style={styles.updatePasswordLink}
                onPress={() => navigation.navigate('AccountSecurity')}
                activeOpacity={0.7}
              >
                <Text style={styles.updatePasswordText}>Update Password {'>'}</Text>
              </TouchableOpacity>
            }
          />
          <View style={styles.divider} />
          <InfoRow
            label="Phone number"
            value={phone || 'Not set'}
            onCopy={phone ? () => copyWithFeedback(phone) : undefined}
          />
          <View style={styles.divider} />
          <InfoRow
            label="Email"
            value={email || 'Not set'}
            onCopy={email ? () => copyWithFeedback(email) : undefined}
          />

          <Text style={styles.warningText}>Please do not share password with anyone</Text>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, savingAlbum && styles.saveBtnDisabled]}
            onPress={() => void handleSaveToAlbum()}
            disabled={savingAlbum}
            activeOpacity={0.8}
          >
            <Ionicons name="download-outline" size={18} color={Colors.success} />
            <Text style={styles.saveBtnText}>Save to album</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.securityCard}>
          <View style={styles.securityRow}>
            <Text style={styles.securityLabel}>Log in with password</Text>
            <Switch
              value={loginWithPassword}
              onValueChange={(v) => void handleToggleLoginPassword(v)}
              trackColor={{ false: Colors.border, true: Colors.success }}
              thumbColor={Colors.background}
            />
          </View>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.securityRow}
            onPress={() => navigation.navigate('AccountSecurity')}
            activeOpacity={0.7}
          >
            <Text style={styles.securityLabel}>Security password</Text>
            <Text style={styles.securityAction}>{securityPasswordLabel}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  headerSpacer: { width: 24 },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    gap: Spacing.lg,
  },
  infoCard: {
    backgroundColor: Colors.background,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  cardCapture: {
    backgroundColor: Colors.background,
  },
  cardGradient: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  logoClip: {
    width: 48,
    height: 48,
    borderRadius: 11,
    overflow: 'hidden',
  },
  logo: {
    width: 48,
    height: 48,
  },
  brandName: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  infoRowWrap: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  infoLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    flexShrink: 0,
  },
  infoValueCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    minWidth: 0,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textPrimary,
    textAlign: 'right',
    flexShrink: 1,
  },
  copyBtn: {
    padding: 2,
  },
  updatePasswordLink: {
    marginTop: Spacing.xs,
    alignSelf: 'flex-end',
  },
  updatePasswordText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.success,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.lg,
  },
  warningText: {
    fontSize: 12,
    color: Colors.warning,
    textAlign: 'center',
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.lg,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.success,
  },
  securityCard: {
    backgroundColor: Colors.background,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    overflow: 'hidden',
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  securityLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  securityAction: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  errorText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.success,
    borderRadius: Radius.md,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textInverse,
  },
});
