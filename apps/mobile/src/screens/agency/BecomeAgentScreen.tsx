import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { whatsappOtpApi } from '@api/whatsappOtp';
import { formatApiError } from '@api/client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useDispatch, useSelector } from 'react-redux';
import { agencyApi } from '@api/agency';
import { authApi } from '@api/auth';
import { setUser } from '@store/authSlice';
import { Colors, Radius, Spacing } from '@/theme';
import { ListRowSkeleton } from '@components/Skeleton';
import { KeyboardAwareScroll } from '@components/keyboard';
import { CopyableId } from '@components/CopyableId';
import { UserIdBadge } from '@components/UserIdBadge';
import { UserAvatar } from '@components/UserAvatar';
import type { RootStackScreenProps } from '@navigation/types';
import type { RootState } from '@store/index';
import { isExactParentLookupQuery } from '@/utils/parentAgentSearch';

type Props = RootStackScreenProps<'BecomeAgent'>;

type Step = 'bind_agency' | 'fill_form' | 'success';
type ApplicationMode = 'root' | 'sub';
type SuccessKind = 'root' | 'sub_pending';

type DesignatedAdminRow = {
  id: string;
  hakaId: string;
  displayName: string;
  region: string | null;
};

type BindAgencyRow = {
  id: string;
  name: string;
  owner: {
    id: string;
    displayName: string;
    hakaId: string | null;
    avatar: string;
  };
};

function ownerAvatarUrl(avatar: string | null | undefined): string | null {
  const url = avatar?.trim();
  return url ? url : null;
}

const IS_EXPO_GO = Constants.appOwnership === 'expo';

/** Expo Go or EXPO_PUBLIC_SKIP_AGENT_OTP — skips Supabase phone re-verify before apply-as-agent (see docs/DEV_PHONE_TESTING.md). */
function skipBecomeAgentPhoneOtp(): boolean {
  if (IS_EXPO_GO) return true;
  const flag = process.env.EXPO_PUBLIC_SKIP_AGENT_OTP;
  return flag === 'true' || flag === '1';
}

const PROPOSED_NAME_MAX = 100;
const PROPOSED_NAME_SUFFIX = "'s Agency";

/** Sub-agency name sent with the application (user already picked parent agency via bind). */
function buildProposedSubAgencyName(displayName: string | null | undefined): string {
  let base = (displayName ?? 'My').trim();
  if (!base) base = 'My';
  const maxBase = PROPOSED_NAME_MAX - PROPOSED_NAME_SUFFIX.length;
  if (base.length > maxBase) base = base.slice(0, maxBase);
  return `${base}${PROPOSED_NAME_SUFFIX}`;
}

export function BecomeAgentScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const user = useSelector((s: RootState) => s.auth.user);
  const bypassBecomeAgentOtp = React.useMemo(() => skipBecomeAgentPhoneOtp(), []);

  /** Until we know whether the user already has a pending application */
  const [bootstrapping, setBootstrapping] = useState(true);

  const [step, setStep] = useState<Step>('bind_agency');
  const [successKind, setSuccessKind] = useState<SuccessKind>('sub_pending');
  const [applicationMode, setApplicationMode] = useState<ApplicationMode>('root');
  const [designatedAdmins, setDesignatedAdmins] = useState<DesignatedAdminRow[]>([]);
  const [loadingDesignatedAdmins, setLoadingDesignatedAdmins] = useState(true);
  const [designatedAdminsError, setDesignatedAdminsError] = useState<string | null>(null);
  const [boundDesignatedAdmin, setBoundDesignatedAdmin] = useState<DesignatedAdminRow | null>(null);
  const [subAgentQuery, setSubAgentQuery] = useState('');
  const [subAgentResult, setSubAgentResult] = useState<BindAgencyRow | null>(null);
  const [loadingSubAgent, setLoadingSubAgent] = useState(false);
  const [subAgentHint, setSubAgentHint] = useState<string | null>(null);
  const [boundParentOwnerId, setBoundParentOwnerId] = useState<string | null>(null);
  const [boundAgent, setBoundAgent] = useState<{
    displayName: string;
    hakaId: string | null;
    avatar: string;
  } | null>(null);

  /** Name for your new sub-agency if the owner approves (sent as `proposedName`, max 100 chars). */
  const [subAgencyName, setSubAgencyName] = useState('');

  const [country, setCountry] = useState(user?.country ?? '');
  const [otp, setOtp] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [applying, setApplying] = useState(false);
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    agencyApi
      .getMyAgentApplication()
      .then((app) => {
        if (cancelled || !app) return;
        if (app.status === 'pending') {
          setSuccessKind('sub_pending');
          setStep('success');
        }
      })
      .catch(() => {
        /* offline / error — continue with apply flow */
      })
      .finally(() => {
        if (!cancelled) setBootstrapping(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingDesignatedAdmins(true);
    setDesignatedAdminsError(null);
    agencyApi
      .listDesignatedBecomeAgencyAdmins()
      .then((rows) => {
        if (!cancelled) setDesignatedAdmins(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setDesignatedAdmins([]);
          setDesignatedAdminsError('Could not load admins. Pull to retry by leaving and re-opening this screen.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDesignatedAdmins(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = subAgentQuery.trim();
    const handle = setTimeout(async () => {
      setSubAgentHint(null);
      setSubAgentResult(null);
      if (!trimmed) {
        setLoadingSubAgent(false);
        return;
      }
      if (!isExactParentLookupQuery(trimmed)) {
        setSubAgentHint('Enter the full Agent Haka ID to apply as a sub-agent.');
        setLoadingSubAgent(false);
        return;
      }
      setLoadingSubAgent(true);
      try {
        const row = await agencyApi.lookupParentAgent(trimmed);
        setSubAgentResult(row);
      } catch (lookupErr: unknown) {
        setSubAgentResult(null);
        const msg =
          lookupErr instanceof Error && lookupErr.message
            ? lookupErr.message
            : 'No agent found for this Haka ID';
        setSubAgentHint(msg);
      } finally {
        setLoadingSubAgent(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [subAgentQuery]);

  const handleBindAdmin = useCallback((row: DesignatedAdminRow) => {
    setApplicationMode('root');
    setBoundDesignatedAdmin(row);
    setBoundParentOwnerId(null);
    setBoundAgent(null);
    setSubAgencyName(buildProposedSubAgencyName(user?.displayName));
    setStep('fill_form');
  }, [user?.displayName]);

  const handleBindSubAgent = useCallback((row: BindAgencyRow) => {
    setApplicationMode('sub');
    setBoundDesignatedAdmin(null);
    setBoundParentOwnerId(row.owner.id);
    setBoundAgent({
      displayName: row.owner.displayName,
      hakaId: row.owner.hakaId,
      avatar: ownerAvatarUrl(row.owner.avatar) ?? '',
    });
    setSubAgencyName(buildProposedSubAgencyName(user?.displayName));
    setStep('fill_form');
  }, [user?.displayName]);

  const handleSendPhoneOtp = useCallback(async () => {
    if (bypassBecomeAgentOtp) {
      Alert.alert(
        'Dev mode',
        'Phone OTP is skipped for this build. Tap Apply when the rest of the form is ready.',
      );
      return;
    }
    const phone = user?.phone?.trim();
    if (!phone) {
      Alert.alert(
        'Phone number required',
        'Add a phone number to your account in Account security, then try again.',
      );
      return;
    }
    setOtpSending(true);
    try {
      await whatsappOtpApi.send(phone);
      setPhoneOtpSent(true);
      setOtp('');
      Alert.alert('Code sent', 'Enter the WhatsApp verification code below.');
    } catch (e: unknown) {
      Alert.alert('Error', formatApiError(e));
      setPhoneOtpSent(false);
    } finally {
      setOtpSending(false);
    }
  }, [user?.phone, bypassBecomeAgentOtp]);

  const handleApply = useCallback(async () => {
    if (applying) return;
    if (applicationMode === 'root') {
      if (!boundDesignatedAdmin?.hakaId) {
        Alert.alert('Required', 'Select an admin first.');
        return;
      }
    } else if (!boundParentOwnerId) {
      Alert.alert('Required', 'Select an agent first.');
      return;
    }
    if (!bypassBecomeAgentOtp) {
      if (!user?.phone?.trim()) {
        Alert.alert('Phone number required', 'Add a phone number in Account security before applying.');
        return;
      }
      if (!phoneOtpSent) {
        Alert.alert('Verification required', 'Tap Get OTP and enter the WhatsApp code sent to your phone.');
        return;
      }
      if (!otp.trim()) {
        Alert.alert('Required', 'Enter the WhatsApp verification code.');
        return;
      }
    }
    const proposedName = subAgencyName.trim();
    if (!proposedName) {
      Alert.alert(
        'Required',
        applicationMode === 'root' ? 'Enter a name for your agency.' : 'Enter a name for your sub-agency.',
      );
      return;
    }
    if (proposedName.length > PROPOSED_NAME_MAX) {
      Alert.alert('Too long', `Agency name must be at most ${PROPOSED_NAME_MAX} characters.`);
      return;
    }
    setApplying(true);
    try {
      if (!bypassBecomeAgentOtp) {
        const phone = user?.phone?.trim();
        if (!phone) throw new Error('Phone number missing.');
        // Step-up ownership check: verifies the OTP for the user's already-bound
        // phone (bind is a no-op re-set since it's the same number on this account).
        await whatsappOtpApi.verifyBind(phone, otp.trim());
        setPhoneOtpSent(false);
      }
      if (applicationMode === 'root') {
        await agencyApi.applyAsAgentUnderAdmin(
          proposedName,
          country.trim(),
          boundDesignatedAdmin!.hakaId,
        );
        setSuccessKind('root');
      } else {
        await agencyApi.applyAsAgent(proposedName, country.trim(), boundParentOwnerId!);
        setSuccessKind('sub_pending');
      }
      const me = await authApi.getMe();
      dispatch(setUser(me));
      setStep('success');
    } catch (e: unknown) {
      Alert.alert('Error', formatApiError(e) || 'Please try again.');
    } finally {
      setApplying(false);
    }
  }, [
    applying,
    bypassBecomeAgentOtp,
    country,
    otp,
    applicationMode,
    boundDesignatedAdmin,
    boundParentOwnerId,
    subAgencyName,
    user?.phone,
    dispatch,
  ]);

  if (bootstrapping) {
    return (
      <View style={[styles.screen, styles.bootstrap, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Become Agent</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.bootstrapBody}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Become Agent</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Policy banner — always visible */}
      <LinearGradient
        colors={['#E040FB', '#FF9100']}
        style={styles.policyBanner}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <Text style={styles.policyTitle}>Haka Agency policy</Text>
        <Text style={styles.policySubtitle}>
          Abundant share ratio | Vast bonus!
        </Text>
        <TouchableOpacity style={styles.policyLink} activeOpacity={0.85}>
          <Text style={styles.policyLinkText}>View details {'>'}</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* ── Step 1: Select admin or sub-agent ── */}
      {step === 'bind_agency' && (
        <FlatList
          data={loadingDesignatedAdmins ? [] : designatedAdmins}
          keyExtractor={(a) => a.id}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.agentListContent,
            { paddingBottom: insets.bottom + Spacing.xl, flexGrow: 1 },
          ]}
          ListHeaderComponent={
            <>
              <Text style={styles.agentSectionTitle}>Become Agency</Text>
              <Text style={[styles.fieldHint, styles.agentSectionHint]}>
                Select a platform admin to open your agency. Applications under these admins are approved instantly.
              </Text>
            </>
          }
          ListEmptyComponent={
            loadingDesignatedAdmins ? (
              <ListRowSkeleton rows={4} />
            ) : (
              <View style={styles.emptyList}>
                <Text style={styles.emptyText}>
                  {designatedAdminsError ?? 'No admins available'}
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <AdminSelectRow row={item} onApply={() => handleBindAdmin(item)} />
          )}
          ListFooterComponent={
            <View style={styles.subAgentSection}>
              <Text style={[styles.agentSectionTitle, styles.subAgentSectionTitle]}>
                Become Sub-Agent
              </Text>
              <Text style={[styles.fieldHint, styles.agentSectionHint]}>
                Enter an agent&apos;s full Haka ID to apply under them. The agent will approve in chat.
              </Text>
              <View style={[styles.inputWrap, { marginBottom: Spacing.sm }]}>
                <Ionicons name="search-outline" size={18} color="#999" />
                <TextInput
                  style={styles.input}
                  value={subAgentQuery}
                  onChangeText={setSubAgentQuery}
                  placeholder="Agent Haka ID…"
                  placeholderTextColor="#CCC"
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>
              {loadingSubAgent ? (
                <ListRowSkeleton rows={1} />
              ) : subAgentResult ? (
                <AgentSelectRow row={subAgentResult} onApply={() => handleBindSubAgent(subAgentResult)} />
              ) : subAgentHint ? (
                <View style={styles.emptyList}>
                  <Text style={styles.emptyText}>{subAgentHint}</Text>
                </View>
              ) : null}
            </View>
          }
        />
      )}

      {/* ── Step 2: Fill Form ── */}
      {step === 'fill_form' && (
        <KeyboardAwareScroll
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.formContent, { paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* User info */}
          <View style={styles.userInfoRow}>
            <UserAvatar
              user={{
                displayName: user?.displayName ?? 'User',
                avatar: user?.avatar ?? null,
                equippedFrame: user?.equippedFrame ?? null,
              }}
              size={56}
            />
            <View>
              <Text style={styles.formUserName}>{user?.displayName ?? 'User'}</Text>
              {user?.activeSpecialId && user?.activeSpecialIdLevel ? (
                <UserIdBadge hakaId={user?.hakaId ?? null} activeSpecialId={user.activeSpecialId} activeSpecialIdLevel={user.activeSpecialIdLevel} width={96} hidePlain />
              ) : (
                <CopyableId value={user?.activeSpecialId ?? user?.hakaId} textStyle={styles.formUserId} />
              )}
            </View>
          </View>

          <Text style={styles.formSectionLabel}>Describe your agent information</Text>

          <View style={styles.boundBanner}>
            {applicationMode === 'sub' && boundAgent ? (
              <UserAvatar
                user={{
                  displayName: boundAgent.displayName,
                  avatar: ownerAvatarUrl(boundAgent.avatar),
                }}
                size={44}
                hideFrame
              />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={styles.boundBannerLabel}>
                {applicationMode === 'root' ? 'Selected admin' : 'Selected agent'}
              </Text>
              {applicationMode === 'root' && boundDesignatedAdmin ? (
                <>
                  <Text style={styles.boundBannerText} numberOfLines={1}>
                    {boundDesignatedAdmin.displayName}
                  </Text>
                  <Text style={styles.boundBannerId} numberOfLines={1}>
                    ID: {boundDesignatedAdmin.hakaId}
                  </Text>
                </>
              ) : boundAgent ? (
                <>
                  <Text style={styles.boundBannerText} numberOfLines={1}>
                    {boundAgent.displayName}
                  </Text>
                  <Text style={styles.boundBannerId} numberOfLines={1}>
                    ID: {boundAgent.hakaId ?? '—'}
                  </Text>
                </>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => setStep('bind_agency')} hitSlop={8}>
              <Text style={styles.boundChange}>Change</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>
            {applicationMode === 'root' ? 'Your agency name' : 'Your sub-agency name'}
          </Text>
          <Text style={styles.fieldHint}>
            {applicationMode === 'root'
              ? `This becomes your agency name immediately after you apply (max ${PROPOSED_NAME_MAX} characters).`
              : `If approved, this becomes your agency name (max ${PROPOSED_NAME_MAX} characters). The owner sees it in your application.`}
          </Text>
          <View style={styles.inputWrap}>
            <Ionicons name="business-outline" size={18} color="#999" />
            <TextInput
              style={styles.input}
              value={subAgencyName}
              onChangeText={setSubAgencyName}
              placeholder="e.g. My Creator Agency"
              placeholderTextColor="#CCC"
              maxLength={PROPOSED_NAME_MAX}
            />
          </View>

          {/* Phone verification (SMS via Firebase — skipped in Expo Go or when EXPO_PUBLIC_SKIP_AGENT_OTP) */}
          <Text style={styles.fieldLabel}>Phone number</Text>
          {bypassBecomeAgentOtp ? (
            <>
              <View style={styles.devBypassBanner}>
                <Ionicons name="flask-outline" size={18} color="#B45309" />
                <Text style={styles.devBypassText}>
                  Development: Firebase phone confirmation is skipped. Use only for Expo Go / internal QA builds.
                  See docs/DEV_PHONE_TESTING.md.
                </Text>
              </View>
              <View style={styles.inputWrap}>
                <Ionicons name="call-outline" size={18} color="#999" />
                <TextInput
                  style={styles.input}
                  value={user?.phone ?? ''}
                  editable={false}
                  placeholder="No phone on account"
                  placeholderTextColor="#CCC"
                />
              </View>
            </>
          ) : (
            <View style={styles.inputRow}>
              <View style={[styles.inputWrap, { flex: 1 }]}>
                <Ionicons name="call-outline" size={18} color="#999" />
                <TextInput
                  style={styles.input}
                  value={user?.phone ?? ''}
                  editable={false}
                  placeholder="No phone on account"
                  placeholderTextColor="#CCC"
                />
              </View>
              <TouchableOpacity
                style={[styles.otpBtn, (otpSending || !user?.phone) && styles.otpBtnDisabled]}
                onPress={handleSendPhoneOtp}
                disabled={otpSending || !user?.phone}
              >
                {otpSending ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.otpBtnText}>Get OTP</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Country */}
          <View style={styles.countryRow}>
            <Text style={styles.fieldLabel}>Country</Text>
            <Text style={styles.countryNote}>* Not to be alter once set</Text>
          </View>
          <View style={styles.inputWrap}>
            <Ionicons name="globe-outline" size={18} color="#999" />
            <TextInput
              style={styles.input}
              value={country}
              onChangeText={setCountry}
              placeholder="India"
              placeholderTextColor="#CCC"
            />
          </View>

          {!bypassBecomeAgentOtp ? (
            <>
              <Text style={styles.fieldLabel}>OTP</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  value={otp}
                  onChangeText={setOtp}
                  placeholder="Please enter OTP"
                  placeholderTextColor="#CCC"
                  keyboardType="number-pad"
                  maxLength={8}
                />
              </View>
            </>
          ) : null}

          {/* Apply button */}
          <TouchableOpacity
            style={[styles.applyBtn, applying && styles.applyBtnDisabled]}
            onPress={handleApply}
            disabled={applying}
          >
            <Text style={styles.applyBtnText}>Apply</Text>
          </TouchableOpacity>
        </KeyboardAwareScroll>
      )}

      {/* ── Step 3: Apply success (after submit or already pending) ── */}
      {step === 'success' && (
        <View style={[styles.successContainer, { paddingBottom: insets.bottom + Spacing.xl }]}>
          <View style={styles.applySuccessIconCircle}>
            <Ionicons name="checkmark" size={40} color="#FFF" />
          </View>
          <Text style={styles.applySuccessTitle}>
            {successKind === 'root' ? 'You are now an agent' : 'Application submitted'}
          </Text>
          <Text style={styles.applySuccessSubtitle}>
            {successKind === 'root'
              ? 'Your agency is active under your selected admin.'
              : 'Awaiting approval from the agent in your chat messages.'}
          </Text>
          <View style={styles.applySuccessUserRow}>
            <UserAvatar
              user={{
                displayName: user?.displayName ?? 'User',
                avatar: user?.avatar ?? null,
                equippedFrame: user?.equippedFrame ?? null,
              }}
              size={48}
            />
            <Text style={styles.applySuccessUserName}>{user?.displayName ?? 'User'}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Admin select row ────────────────────────────────────────────────────────

function AdminSelectRow({ row, onApply }: { row: DesignatedAdminRow; onApply: () => void }) {
  return (
    <View style={styles.agentCard}>
      <View style={styles.agentCardRow}>
        <View style={styles.adminAvatarFallback}>
          <Ionicons name="shield-checkmark-outline" size={24} color={Colors.primary} />
        </View>
        <View style={styles.agentInfo}>
          <Text style={styles.agentName} numberOfLines={1}>{row.displayName}</Text>
          <Text style={styles.agentId} numberOfLines={1}>
            {row.hakaId}
          </Text>
        </View>
        <TouchableOpacity style={styles.applyPill} onPress={onApply}>
          <Text style={styles.applyPillText}>Apply</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Agent select row ────────────────────────────────────────────────────────

function AgentSelectRow({ row, onApply }: { row: BindAgencyRow; onApply: () => void }) {
  return (
    <View style={styles.agentCard}>
      <View style={styles.agentCardRow}>
        <UserAvatar
          user={{
            displayName: row.owner.displayName,
            avatar: ownerAvatarUrl(row.owner.avatar),
          }}
          size={52}
          hideFrame
        />
        <View style={styles.agentInfo}>
          <Text style={styles.agentName} numberOfLines={1}>{row.owner.displayName}</Text>
          <Text style={styles.agentId} numberOfLines={1}>
            {row.owner.hakaId ?? row.name}
          </Text>
        </View>
        <TouchableOpacity style={styles.applyPill} onPress={onApply}>
          <Text style={styles.applyPillText}>Apply</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F2F2F7' },
  bootstrap: { flex: 1 },
  bootstrapBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },

  // Header
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
    color: '#000',
    textAlign: 'center',
  },

  // Policy banner
  policyBanner: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  policyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF',
  },
  policySubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  policyLink: {
    marginTop: Spacing.sm,
    backgroundColor: '#FFF',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },
  policyLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF3366',
  },

  // Section
  agentSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  agentSectionHint: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  subAgentSection: {
    marginTop: Spacing.xl,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  subAgentSectionTitle: {
    marginTop: 0,
  },
  adminAvatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Agent list
  agentListContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  agentCard: {
    backgroundColor: '#FFF',
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  agentCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  agentInfo: { flex: 1, gap: 2 },
  agentName: { fontSize: 15, fontWeight: '600', color: '#000' },
  agentId: { fontSize: 12, color: '#999' },
  applyPill: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },
  applyPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
  },
  emptyList: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  boundBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: '#F5F5F5',
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
  },
  boundBannerLabel: { fontSize: 11, color: '#888', fontWeight: '600' },
  boundBannerText: { fontSize: 14, color: '#000', fontWeight: '600' },
  boundBannerId: { fontSize: 12, color: '#999', marginTop: 1 },
  boundChange: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  devBypassBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
  },
  devBypassText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    lineHeight: 17,
  },

  // Empty state
  emptyText: { fontSize: 15, fontWeight: '600', color: '#666' },
  emptyHint: { fontSize: 13, color: '#999', textAlign: 'center', paddingHorizontal: Spacing.xl },
  skipBtn: {
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },
  skipBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },

  // ── Form step ──
  formContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  formAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  formAvatarFallback: {
    backgroundColor: '#E8E8E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formAvatarInitial: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
  },
  formUserName: { fontSize: 16, fontWeight: '600', color: '#000' },
  formUserId: { fontSize: 11, color: '#999', marginTop: 2 },
  formSectionLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: Spacing.sm,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
  },
  fieldHint: {
    fontSize: 12,
    color: '#888',
    marginTop: -4,
    marginBottom: Spacing.xs,
    lineHeight: 17,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: Radius.md,
    height: 48,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#000',
  },
  inputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  otpBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    minWidth: 96,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBtnDisabled: { opacity: 0.45 },
  otpBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  countryNote: {
    fontSize: 10,
    color: '#FF4D4D',
  },

  // Apply button
  applyBtn: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.lg,
  },
  applyBtnDisabled: { opacity: 0.5 },
  applyBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },

  // ── Apply success (matches product reference) ──
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  applySuccessIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.info,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  applySuccessTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  applySuccessSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    lineHeight: 20,
  },
  applySuccessUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  applySuccessUserName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
  },

  // ── Restart overlay ──
  overlayBg: {
    flex: 1,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 60,
  },
  overlayCard: {
    backgroundColor: '#FFF',
    marginHorizontal: Spacing.xl,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    width: '85%',
  },
  overlayTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
  },
  overlaySubtitle: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },
  overlayBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xxxl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    width: '100%',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  overlayBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
});
