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
import { useDispatch, useSelector } from 'react-redux';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Radius, Spacing } from '@/theme';
import { ListRowSkeleton } from '@components/Skeleton';
import { KeyboardAwareScroll } from '@components/keyboard';
import { settingsApi, AccountSecurity } from '@api/settings';
import { authApi } from '@api/auth';
import { emailOtpApi } from '@api/emailOtp';
import { formatApiError, isApiError } from '@api/client';
import { clearAuth } from '@store/authSlice';
import { TokenStorage } from '../../storage';
import type { RootStackScreenProps } from '@navigation/types';
import type { AppDispatch, RootState } from '@store/index';
import {
  saveAccountDisplayPassword,
  setPendingPasswordReveal,
} from '../../utils/accountPasswordStorage';

type Props = RootStackScreenProps<'AccountSecurity'>;

const SECURITY_COLORS: Record<string, string> = {
  low: '#FF4D4D',
  medium: '#E8A020',
  high: '#22C97A',
};

export function AccountSecurityScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch<AppDispatch>();
  const userId = useSelector((state: RootState) => state.auth.user?.id);
  const userEmail = useSelector((state: RootState) => state.auth.user?.email);
  const [security, setSecurity] = useState<AccountSecurity | null>(null);
  const [loading, setLoading] = useState(true);

  // Password change state — every change is confirmed with an email OTP.
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwOtpSent, setPwOtpSent] = useState(false);
  const [pwOtpCode, setPwOtpCode] = useState('');
  const [pwSubmitting, setPwSubmitting] = useState(false);

  // Email bind state
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailSubmitting, setEmailSubmitting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      settingsApi.getAccountSecurity()
        .then(setSecurity)
        .catch(() => {})
        .finally(() => setLoading(false));
    }, []),
  );

  const resetPasswordForm = useCallback(() => {
    setShowPasswordForm(false);
    setCurrentPw('');
    setNewPw('');
    setPwOtpCode('');
    setPwOtpSent(false);
  }, []);

  // Step 1 — validate the new password, then email a verification OTP via Supabase.
  const handleSendPasswordOtp = useCallback(async () => {
    if (!newPw || newPw.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return;
    }
    if (security?.has_password && !currentPw) {
      Alert.alert('Error', 'Please enter your current password.');
      return;
    }
    if (!userEmail) {
      Alert.alert(
        'Email required',
        'Add an email to your account first — the verification code is sent there.',
      );
      return;
    }
    setPwSubmitting(true);
    try {
      await emailOtpApi.send(userEmail);
      setPwOtpSent(true);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not send the verification code.');
    } finally {
      setPwSubmitting(false);
    }
  }, [newPw, currentPw, security?.has_password, userEmail]);

  // Step 2 — verify the OTP for a Supabase token, then change the password with it.
  const handleVerifyAndChangePassword = useCallback(async () => {
    if (!pwOtpCode || pwOtpCode.length < 6) {
      Alert.alert('Error', 'Please enter the verification code.');
      return;
    }
    if (!userEmail) return;
    setPwSubmitting(true);
    try {
      const accessToken = await emailOtpApi.verify(userEmail, pwOtpCode);
      await settingsApi.changePassword(currentPw, newPw, accessToken);
      if (userId) {
        await saveAccountDisplayPassword(userId, newPw);
        setPendingPasswordReveal(userId, newPw);
      }
      Alert.alert('Success', 'Password updated successfully.');
      resetPasswordForm();
      const updated = await settingsApi.getAccountSecurity();
      setSecurity(updated);
    } catch (e: unknown) {
      Alert.alert('Error', formatApiError(e) || (e instanceof Error ? e.message : 'Failed to update password.'));
    } finally {
      setPwSubmitting(false);
    }
  }, [pwOtpCode, currentPw, newPw, userId, userEmail, resetPasswordForm]);

  const handleBindEmail = useCallback(async () => {
    if (!emailInput.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email address.');
      return;
    }
    setEmailSubmitting(true);
    try {
      await settingsApi.bindEmail(emailInput.trim());
      Alert.alert('Success', 'Email bound successfully.');
      setShowEmailForm(false);
      setEmailInput('');
      const updated = await settingsApi.getAccountSecurity();
      setSecurity(updated);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to bind email.');
    } finally {
      setEmailSubmitting(false);
    }
  }, [emailInput]);

  const handleCancelAccount = useCallback(async () => {
    // Pre-check eligibility so blocked users see why BEFORE the scary dialog.
    try {
      const eligibility = await authApi.getDeletionEligibility();
      if (!eligibility.eligible) {
        Alert.alert(
          'Cannot Delete Account',
          `${eligibility.reasons.map((r) => r.message).join('\n')}\n\nNeed help? Contact ${eligibility.supportEmail}.`,
        );
        return;
      }
    } catch (e: unknown) {
      Alert.alert('Error', formatApiError(e) || 'Could not check account status. Please try again.');
      return;
    }

    Alert.alert(
      'Cancel Account',
      'Are you sure you want to permanently delete your account? This action cannot be undone.',
      [
        { text: 'Keep Account', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            try {
              await authApi.deleteAccount();
            } catch (e: unknown) {
              // 409 = blocked since the pre-check (e.g. a withdrawal just landed).
              if (isApiError(e) && e.status === 409) {
                Alert.alert('Cannot Delete Account', e.message);
                return;
              }
              Alert.alert('Error', formatApiError(e) || 'Account deletion failed. Please try again.');
              return;
            }
            await TokenStorage.clear();
            dispatch(clearAuth());
          },
        },
      ],
    );
  }, [dispatch]);

  if (loading || !security) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ListRowSkeleton rows={6} />
      </View>
    );
  }

  const levelColor = SECURITY_COLORS[security.security_level] ?? '#FF4D4D';

  const items = [
    {
      icon: 'lock-closed-outline',
      label: 'Password modification',
      action: security.has_password ? '>' : 'Set >',
      onPress: () => (showPasswordForm ? resetPasswordForm() : setShowPasswordForm(true)),
    },
    {
      icon: 'mail-outline',
      label: 'Email',
      action: security.has_email ? security.email_masked : 'Bind >',
      onPress: () => {
        if (!security.has_email) setShowEmailForm(!showEmailForm);
      },
    },
    {
      // Linked automatically when the account signs in with Google — no manual bind.
      icon: 'logo-google',
      label: 'Google',
      action: security.has_google ? 'Linked' : 'Not linked',
      onPress: () => {
        if (!security.has_google) {
          Alert.alert('Google', 'Sign in with Google to automatically link your account.');
        }
      },
    },
    {
      icon: 'phone-portrait-outline',
      label: 'Device management',
      action: '>',
      onPress: () => navigation.navigate('DeviceManagement'),
    },
  ];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account and Security</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAwareScroll
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      >
        {/* Shield */}
        <View style={styles.shieldSection}>
          <View style={[styles.shieldIcon, { backgroundColor: levelColor + '15' }]}>
            <Ionicons name="shield-checkmark" size={48} color={levelColor} />
          </View>
          <Text style={[styles.warningText, { color: levelColor }]}>
            {security.security_level === 'high'
              ? 'Your account security level is high.'
              : 'Your account level is low, please complete the relevant information.'}
          </Text>
          {security.security_level !== 'high' && (
            <Text style={styles.hintText}>
              Binding an email can raise the security level to medium.
            </Text>
          )}
        </View>

        {/* Items */}
        {items.map((item, index) => (
          <TouchableOpacity key={index} style={styles.itemRow} onPress={item.onPress} activeOpacity={0.7}>
            <Ionicons name={item.icon as any} size={20} color="#666" />
            <Text style={styles.itemLabel}>{item.label}</Text>
            <Text style={styles.itemAction}>{item.action}</Text>
          </TouchableOpacity>
        ))}

        {/* Password form — confirmed with an email OTP */}
        {showPasswordForm && (
          <View style={styles.formSection}>
            {!pwOtpSent ? (
              <>
                {security.has_password && (
                  <TextInput
                    style={styles.formInput}
                    value={currentPw}
                    onChangeText={setCurrentPw}
                    placeholder="Current password"
                    placeholderTextColor="#999"
                    secureTextEntry
                  />
                )}
                <TextInput
                  style={styles.formInput}
                  value={newPw}
                  onChangeText={setNewPw}
                  placeholder="New password (min 6 characters)"
                  placeholderTextColor="#999"
                  secureTextEntry
                />
                <Text style={styles.formHint}>
                  {userEmail
                    ? `We'll email a verification code to ${userEmail} to confirm this change.`
                    : 'Add an email to your account first — the verification code is sent there.'}
                </Text>
                <TouchableOpacity
                  style={[styles.formBtn, (pwSubmitting || !userEmail) && { opacity: 0.5 }]}
                  onPress={handleSendPasswordOtp}
                  disabled={pwSubmitting || !userEmail}
                >
                  <Text style={styles.formBtnText}>Send verification code</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.formHint}>
                  Enter the code sent to {userEmail}
                </Text>
                <TextInput
                  style={styles.formInput}
                  value={pwOtpCode}
                  onChangeText={setPwOtpCode}
                  placeholder="Verification code"
                  placeholderTextColor="#999"
                  keyboardType="number-pad"
                />
                <TouchableOpacity
                  style={[styles.formBtn, pwSubmitting && { opacity: 0.5 }]}
                  onPress={handleVerifyAndChangePassword}
                  disabled={pwSubmitting}
                >
                  <Text style={styles.formBtnText}>
                    {security.has_password ? 'Verify & Change Password' : 'Verify & Set Password'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setPwOtpSent(false); setPwOtpCode(''); }}>
                  <Text style={styles.formLink}>Back</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Email form */}
        {showEmailForm && (
          <View style={styles.formSection}>
            <TextInput
              style={styles.formInput}
              value={emailInput}
              onChangeText={setEmailInput}
              placeholder="Enter your email address"
              placeholderTextColor="#999"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={[styles.formBtn, emailSubmitting && { opacity: 0.5 }]}
              onPress={handleBindEmail}
              disabled={emailSubmitting}
            >
              <Text style={styles.formBtnText}>Bind Email</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Cancel Account */}
        <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelAccount}>
          <Text style={styles.cancelBtnText}>Cancel Account</Text>
        </TouchableOpacity>
      </KeyboardAwareScroll>
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

  shieldSection: { alignItems: 'center', paddingVertical: Spacing.xxl, paddingHorizontal: Spacing.xl, gap: Spacing.sm },
  shieldIcon: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm,
  },
  warningText: { fontSize: 13, fontWeight: '500', textAlign: 'center' },
  hintText: { fontSize: 12, color: '#999', textAlign: 'center' },

  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg,
    borderBottomWidth: 1, borderBottomColor: '#F5F5F5', gap: Spacing.md,
  },
  itemLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: '#000' },
  itemAction: { fontSize: 13, color: '#999' },

  formSection: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.sm,
    backgroundColor: '#FAFAFA',
  },
  formInput: {
    backgroundColor: '#FFF', borderRadius: Radius.md, height: 44,
    paddingHorizontal: Spacing.md, fontSize: 14, color: '#000',
    borderWidth: 1, borderColor: '#E0E0E0',
  },
  formBtn: {
    height: 44, backgroundColor: Colors.primary, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  formBtnText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  formHint: { fontSize: 13, color: '#666', marginBottom: Spacing.xs },
  formLink: { fontSize: 13, color: Colors.primary, textAlign: 'center', marginTop: Spacing.xs },

  cancelBtn: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.xxl, height: 48,
    borderRadius: Radius.md, backgroundColor: '#FF4D4D',
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: '#FFF' },
});
