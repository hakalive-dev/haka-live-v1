import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScroll } from '@components/keyboard';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';

import { authApi } from '../api/auth';
import { Colors, Radius, Spacing } from '../theme';
import { TokenStorage } from '../storage';
import { setUser } from '../store/authSlice';
import { setProfile } from '../store/profileSlice';
import type { RootState } from '../store';
import { INDIA_STATES } from '@haka-live/shared-types/state-rankings';
import { StatePickerField, StatePickerModal } from '@components/StatePicker';

const DOB_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const user = useSelector((s: RootState) => s.auth.user);

  const profileLocked = Boolean(
    user?.onboardingComplete && user?.hakaId && user.hakaId.length > 0,
  );

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [country, setCountry] = useState(user?.country ?? '');
  const [stateCode, setStateCode] = useState(user?.state ?? '');
  const [city, setCity] = useState(user?.city ?? '');
  const [gender, setGender] = useState<string>(user?.gender ?? '');
  const [dob, setDob] = useState<string>(user?.dateOfBirth ? user.dateOfBirth.slice(0, 10) : '');
  const [saving, setSaving] = useState(false);
  const [showStatePicker, setShowStatePicker] = useState(false);

  const hasStateList = country.trim().toLowerCase() === 'india' || country.trim().toUpperCase() === 'IN';
  const stateDisplayName =
    INDIA_STATES.find((s) => s.code === stateCode)?.name ?? (stateCode || '');

  // Re-seed form when auth user loads (e.g. opened before Redux hydrated).
  useEffect(() => {
    if (!user?.id) return;
    setDisplayName(user.displayName ?? '');
    setBio(user.bio ?? '');
    setCountry(user.country ?? '');
    setStateCode(user.state ?? '');
    setCity(user.city ?? '');
    setGender(user.gender ?? '');
    setDob(user.dateOfBirth ? user.dateOfBirth.slice(0, 10) : '');
  }, [user?.id]);

  const onSave = useCallback(async () => {
    if (!displayName.trim()) {
      Alert.alert('Display name required');
      return;
    }

    let dateOfBirth: string | null = null;
    if (dob.trim()) {
      if (!DOB_PATTERN.test(dob.trim())) {
        Alert.alert('Invalid date', 'Date of birth must be in YYYY-MM-DD format.');
        return;
      }
      const parsed = new Date(`${dob.trim()}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime())) {
        Alert.alert('Invalid date', 'Please enter a valid date of birth.');
        return;
      }
      dateOfBirth = parsed.toISOString();
    }

    setSaving(true);
    try {
      const payload: Parameters<typeof authApi.updateProfile>[0] = {
        displayName: displayName.trim(),
        bio: bio.trim(),
        city: city.trim(),
        dateOfBirth,
      };
      if (!profileLocked) {
        const trimmedCountry = country.trim();
        if (trimmedCountry.length >= 2) {
          payload.country = trimmedCountry;
        }
        if (gender) {
          payload.gender = gender;
        }
      }
      if (hasStateList && stateCode.trim() && (!profileLocked || !user?.state?.trim())) {
        payload.state = stateCode.trim();
      }
      const updated = await authApi.updateProfile(payload);
      dispatch(setUser(updated));
      dispatch(setProfile(updated));
      void TokenStorage.setUserJson(JSON.stringify(updated));
      navigation.goBack();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not save profile';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  }, [displayName, bio, country, stateCode, city, gender, dob, profileLocked, hasStateList, user?.state, dispatch, navigation]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Edit Profile</Text>
        <Pressable onPress={onSave} disabled={saving} hitSlop={10}>
          <Text style={styles.save}>Save</Text>
        </Pressable>
      </View>

      <KeyboardAwareScroll contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <Text style={styles.label}>Display name</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            placeholderTextColor={Colors.textTertiary}
            maxLength={50}
          />

          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={bio}
            onChangeText={setBio}
            placeholder="A short bio"
            placeholderTextColor={Colors.textTertiary}
            maxLength={200}
            multiline
          />
          <Text style={styles.counter}>{bio.length}/200</Text>

          <Text style={styles.label}>Country</Text>
          <TextInput
            style={[styles.input, profileLocked && styles.inputDisabled]}
            value={country}
            onChangeText={setCountry}
            placeholder="Country"
            placeholderTextColor={Colors.textTertiary}
            maxLength={80}
            editable={!profileLocked}
          />
          {profileLocked ? (
            <Text style={styles.hint}>
              Country cannot be changed after your Haka ID is created. Contact support if you need help.
            </Text>
          ) : null}

          {hasStateList ? (
            <StatePickerField
              label="State / Province"
              value={stateCode}
              displayName={stateDisplayName}
              onPress={() => setShowStatePicker(true)}
              disabled={profileLocked && Boolean(user?.state?.trim())}
              hint={
                profileLocked && user?.state
                  ? 'State cannot be changed after your Haka ID is created. Contact support if you need help.'
                  : 'Required for State Star rankings if you are a verified female host.'
              }
            />
          ) : null}

          <Text style={styles.label}>City</Text>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            placeholder="City (optional — regional live-room rank)"
            placeholderTextColor={Colors.textTertiary}
            maxLength={80}
          />
          <Text style={styles.hint}>
            Leave empty to clear. Shown on home live cards when you earn beans in your city shard.
          </Text>

          <Text style={styles.label}>Date of Birth (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={dob}
            onChangeText={setDob}
            placeholder="1995-06-15"
            placeholderTextColor={Colors.textTertiary}
            maxLength={10}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Gender</Text>
          {profileLocked ? (
            <Text style={styles.hint}>
              Gender cannot be changed after your Haka ID is created. Contact support if you need help.
            </Text>
          ) : null}
          <View style={[styles.genderRow, profileLocked && styles.genderRowDisabled]}>
            {[
              { v: 'male', label: 'Male ♂' },
              { v: 'female', label: 'Female ♀' },
              { v: 'other', label: 'Other' },
              { v: 'prefer_not_to_say', label: 'Prefer not to say' },
            ].map((opt) => (
              <Pressable
                key={opt.v}
                onPress={() => !profileLocked && setGender(opt.v)}
                disabled={profileLocked}
                style={[
                  styles.genderChip,
                  gender === opt.v && styles.genderChipActive,
                  profileLocked && styles.genderChipDisabled,
                ]}
              >
                <Text
                  style={[styles.genderChipText, gender === opt.v && styles.genderChipTextActive]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
      </KeyboardAwareScroll>

      {hasStateList ? (
        <StatePickerModal
          visible={showStatePicker}
          states={INDIA_STATES}
          selectedCode={stateCode}
          onSelect={(code) => setStateCode(code)}
          onClose={() => setShowStatePicker(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { color: Colors.textPrimary, fontSize: 17, fontWeight: '700' },
  save: { color: Colors.primaryLight, fontSize: 15, fontWeight: '600' },
  content: { padding: Spacing.lg, gap: Spacing.sm },
  label: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: Spacing.md,
  },
  input: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.textPrimary,
    fontSize: 15,
  },
  inputDisabled: {
    opacity: 0.55,
  },
  textarea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  counter: {
    alignSelf: 'flex-end',
    color: Colors.textTertiary,
    fontSize: 11,
  },
  hint: {
    color: Colors.textTertiary,
    fontSize: 12,
    lineHeight: 16,
    marginTop: Spacing.xs,
  },
  genderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.xs },
  genderRowDisabled: { opacity: 0.55 },
  genderChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  genderChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  genderChipDisabled: { opacity: 0.7 },
  genderChipText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  genderChipTextActive: { color: '#FFFFFF' },
});
