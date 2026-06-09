import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useDispatch } from 'react-redux';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScroll } from '@components/keyboard';

import { authApi } from '@api/auth';
import { invitesApi } from '@api/invites';
import { setAuth, clearAuth } from '../../store/authSlice';
import {
  normalizeInviterId,
  isValidPublicHakaId,
} from '../../invite/normalizeInviterId';
import { TokenStorage } from '../../storage';
import { AppDispatch } from '../../store';
import { AuthStackParamList } from '@navigation/types';

type Nav = NativeStackNavigationProp<AuthStackParamList>;

// ── Constants ─────────────────────────────────────────────────────────────────

const GENDERS = [
  { label: 'Male',                value: 'male',              icon: 'gender-male' as const },
  { label: 'Female',              value: 'female',            icon: 'gender-female' as const },
  { label: 'Prefer not to mention', value: 'prefer_not_to_say', icon: 'gender-non-binary' as const },
];

const COUNTRIES = [
  { flag: '🇺🇸', name: 'United States' },
  { flag: '🇬🇧', name: 'United Kingdom' },
  { flag: '🇨🇦', name: 'Canada' },
  { flag: '🇦🇺', name: 'Australia' },
  { flag: '🇮🇳', name: 'India' },
  { flag: '🇳🇬', name: 'Nigeria' },
  { flag: '🇬🇭', name: 'Ghana' },
  { flag: '🇰🇪', name: 'Kenya' },
  { flag: '🇿🇦', name: 'South Africa' },
  { flag: '🇵🇭', name: 'Philippines' },
  { flag: '🇲🇾', name: 'Malaysia' },
  { flag: '🇸🇬', name: 'Singapore' },
  { flag: '🇮🇩', name: 'Indonesia' },
  { flag: '🇵🇰', name: 'Pakistan' },
  { flag: '🇧🇩', name: 'Bangladesh' },
  { flag: '🇸🇦', name: 'Saudi Arabia' },
  { flag: '🇦🇪', name: 'UAE' },
  { flag: '🇶🇦', name: 'Qatar' },
  { flag: '🇰🇼', name: 'Kuwait' },
  { flag: '🇯🇵', name: 'Japan' },
  { flag: '🇰🇷', name: 'South Korea' },
  { flag: '🇨🇳', name: 'China' },
  { flag: '🇧🇷', name: 'Brazil' },
  { flag: '🇲🇽', name: 'Mexico' },
  { flag: '🇩🇪', name: 'Germany' },
  { flag: '🇫🇷', name: 'France' },
  { flag: '🇮🇹', name: 'Italy' },
  { flag: '🇪🇸', name: 'Spain' },
  { flag: '🇳🇱', name: 'Netherlands' },
  { flag: '🇷🇺', name: 'Russia' },
  { flag: '🇹🇷', name: 'Turkey' },
  { flag: '🇪🇬', name: 'Egypt' },
  { flag: '🇪🇹', name: 'Ethiopia' },
  { flag: '🇹🇿', name: 'Tanzania' },
  { flag: '🇺🇬', name: 'Uganda' },
  { flag: '🇷🇼', name: 'Rwanda' },
  { flag: '🇨🇲', name: 'Cameroon' },
  { flag: '🇸🇳', name: 'Senegal' },
  { flag: '🇨🇮', name: "Côte d'Ivoire" },
  { flag: '🇿🇼', name: 'Zimbabwe' },
  { flag: '🇿🇲', name: 'Zambia' },
  { flag: '🇲🇦', name: 'Morocco' },
  { flag: '🇩🇿', name: 'Algeria' },
  { flag: '🇹🇳', name: 'Tunisia' },
  { flag: '🇱🇾', name: 'Libya' },
  { flag: '🇺🇦', name: 'Ukraine' },
  { flag: '🇵🇱', name: 'Poland' },
  { flag: '🇸🇪', name: 'Sweden' },
  { flag: '🇳🇴', name: 'Norway' },
  { flag: '🇩🇰', name: 'Denmark' },
  { flag: '🇫🇮', name: 'Finland' },
  { flag: '🇮🇪', name: 'Ireland' },
  { flag: '🇮🇷', name: 'Iran' },
  { flag: '🇮🇶', name: 'Iraq' },
  { flag: '🇱🇧', name: 'Lebanon' },
  { flag: '🇯🇴', name: 'Jordan' },
  { flag: '🇾🇪', name: 'Yemen' },
  { flag: '🇴🇲', name: 'Oman' },
  { flag: '🇧🇭', name: 'Bahrain' },
  { flag: '🇵🇸', name: 'Palestine' },
  { flag: '🇻🇳', name: 'Vietnam' },
  { flag: '🇹🇭', name: 'Thailand' },
  { flag: '🇱🇰', name: 'Sri Lanka' },
  { flag: '🇲🇲', name: 'Myanmar' },
  { flag: '🇳🇵', name: 'Nepal' },
  { flag: '🇦🇷', name: 'Argentina' },
  { flag: '🇨🇱', name: 'Chile' },
  { flag: '🇨🇴', name: 'Colombia' },
  { flag: '🇵🇪', name: 'Peru' },
  { flag: '🇳🇿', name: 'New Zealand' },
];

// ── Calendar helpers ──────────────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function OnboardingScreen() {
  const navigation = useNavigation<Nav>();
  const dispatch = useDispatch<AppDispatch>();
  const insets = useSafeAreaInsets();

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [country, setCountry]         = useState('');
  const [city, setCity]               = useState('');
  const [gender, setGender]           = useState('');
  const [dob, setDob]                 = useState<Date | null>(null);
  const [inviterHakaId, setInviterHakaId] = useState('');

  // Modal visibility
  const [showCountry, setShowCountry] = useState(false);
  const [showGender, setShowGender]   = useState(false);
  const [showCal, setShowCal]         = useState(false);

  // Calendar nav state
  const today = new Date();
  const [calYear, setCalYear]   = useState(today.getFullYear() - 18);
  const [calMonth, setCalMonth] = useState(today.getMonth());

  // Country search
  const [countrySearch, setCountrySearch] = useState('');
  const filteredCountries = useMemo(
    () =>
      countrySearch.trim()
        ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(countrySearch.toLowerCase()))
        : COUNTRIES,
    [countrySearch],
  );

  // Submission
  const [loading, setLoading] = useState(false);
  const [errors, setErrors]   = useState<Record<string, string>>({});

  // ── Helpers ──────────────────────────────────────────────────────────────

  const dobDisplay = dob
    ? `${String(dob.getDate()).padStart(2,'0')}/${String(dob.getMonth()+1).padStart(2,'0')}/${dob.getFullYear()}`
    : '';

  const dobApi = dob
    ? `${dob.getFullYear()}-${String(dob.getMonth()+1).padStart(2,'0')}-${String(dob.getDate()).padStart(2,'0')}`
    : '';

  function deriveUsername(name: string): string {
    const base = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
    const suffix = Math.floor(100 + Math.random() * 900);
    return base + suffix;
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const e: Record<string, string> = {};
    if (!displayName.trim())  e.name    = 'Name is required.';
    if (!country)             e.country = 'Country is required.';
    if (!gender)              e.gender  = 'Gender is required.';
    if (!dob)                 e.dob     = 'Date of birth is required.';

    const inviterId = normalizeInviterId(inviterHakaId);
    if (inviterId && !isValidPublicHakaId(inviterId)) {
      e.inviterHakaId = 'Enter a valid 9-digit Haka ID.';
    }

    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    setErrors({});
    setLoading(true);

    try {
      await authApi.completeOnboarding({
        username:    deriveUsername(displayName.trim()),
        displayName: displayName.trim(),
        country,
        ...(city.trim().length >= 1 ? { city: city.trim() } : {}),
        gender,
        dateOfBirth: dob ? new Date(dobApi + 'T00:00:00.000Z').toISOString() : null,
      });
      // Fetch the canonical user from /auth/me — guaranteed to include hakaId.
      const user = await authApi.getMe();
      const accessToken  = await TokenStorage.getAccess();
      const refreshToken = await TokenStorage.getRefresh();
      await TokenStorage.setUserJson(JSON.stringify(user));
      dispatch(setAuth({ user, accessToken: accessToken!, refreshToken: refreshToken! }));

      if (inviterId) {
        try {
          await invitesApi.accept(inviterId);
          Alert.alert(
            'Invite applied',
            "Your friend's invite was applied successfully.",
          );
        } catch (inviteErr: unknown) {
          const inviteMsg =
            inviteErr &&
            typeof inviteErr === 'object' &&
            'message' in inviteErr &&
            typeof (inviteErr as Error).message === 'string'
              ? (inviteErr as Error).message
              : 'Could not apply this invite code.';
          Alert.alert('Invite code', inviteMsg);
        }
      }
    } catch (err: any) {
      const msg: string = err?.message ?? 'Something went wrong.';
      if (msg.toLowerCase().includes('username')) {
        setErrors({ name: 'Username taken — try a different name.' });
      } else {
        setErrors({ general: msg });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    // Onboarding is the only root screen (logged in but profile incomplete) — goBack is a no-op.
    void (async () => {
      await TokenStorage.clear();
      dispatch(clearAuth());
    })();
  };

  // ── Calendar grid ─────────────────────────────────────────────────────────

  const calDays = useMemo(() => {
    const total  = daysInMonth(calYear, calMonth);
    const offset = firstDayOfMonth(calYear, calMonth);
    const cells: (number | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= total; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calYear, calMonth]);

  const selectedDay   = dob && dob.getMonth() === calMonth && dob.getFullYear() === calYear ? dob.getDate() : null;

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={10}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Register your account</Text>
        </View>

        <KeyboardAwareScroll
          contentContainerStyle={styles.scroll}
        >
          {/* Name */}
          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <View style={[styles.inputRow, errors.name ? styles.inputRowError : null]}>
              <Ionicons name="person-outline" size={18} color="rgba(255,255,255,0.6)" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="John Doe"
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={displayName}
                onChangeText={(t) => { setDisplayName(t); setErrors(e => ({ ...e, name: '' })); }}
                returnKeyType="done"
              />
            </View>
            {errors.name ? <Text style={styles.fieldError}>{errors.name}</Text> : null}
          </View>

          {/* Country */}
          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Country</Text>
              <Text style={styles.immutable}>Not to be alter once set</Text>
            </View>
            <TouchableOpacity
              style={[styles.inputRow, errors.country ? styles.inputRowError : null]}
              onPress={() => setShowCountry(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="globe-outline" size={18} color="rgba(255,255,255,0.6)" style={styles.inputIcon} />
              <Text style={[styles.inputText, !country && styles.inputPlaceholder]}>
                {country || 'Select country'}
              </Text>
              <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.5)" style={styles.inputChevron} />
            </TouchableOpacity>
            {errors.country ? <Text style={styles.fieldError}>{errors.country}</Text> : null}
          </View>

          {/* City (optional) — regional leaderboard shard */}
          <View style={styles.field}>
            <Text style={styles.label}>City (optional)</Text>
            <View style={styles.inputRow}>
              <Ionicons name="location-outline" size={18} color="rgba(255,255,255,0.6)" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="e.g. Delhi"
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={city}
                onChangeText={setCity}
                maxLength={80}
                returnKeyType="done"
              />
            </View>
            <Text style={styles.cityHint}>Used for city-level earner ranks on live room cards.</Text>
          </View>

          {/* Gender */}
          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Gender</Text>
              <Text style={styles.immutable}>Not to be alter once set</Text>
            </View>
            <TouchableOpacity
              style={[styles.inputRow, errors.gender ? styles.inputRowError : null]}
              onPress={() => setShowGender(true)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name={gender === 'female' ? 'gender-female' : gender === 'prefer_not_to_say' ? 'gender-non-binary' : 'gender-male'}
                size={18}
                color="rgba(255,255,255,0.6)"
                style={styles.inputIcon}
              />
              <Text style={[styles.inputText, !gender && styles.inputPlaceholder]}>
                {GENDERS.find(g => g.value === gender)?.label || 'Select gender'}
              </Text>
              <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.5)" style={styles.inputChevron} />
            </TouchableOpacity>
            {errors.gender ? <Text style={styles.fieldError}>{errors.gender}</Text> : null}
          </View>

          {/* Date of Birth */}
          <View style={styles.field}>
            <Text style={styles.label}>Date of Birth</Text>
            <TouchableOpacity
              style={[styles.inputRow, errors.dob ? styles.inputRowError : null]}
              onPress={() => setShowCal(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="calendar-outline" size={18} color="rgba(255,255,255,0.6)" style={styles.inputIcon} />
              <Text style={[styles.inputText, !dob && styles.inputPlaceholder]}>
                {dob ? dobDisplay : 'DD/MM/YYYY'}
              </Text>
              <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.5)" style={styles.inputChevron} />
            </TouchableOpacity>
            {errors.dob ? <Text style={styles.fieldError}>{errors.dob}</Text> : null}
          </View>

          {/* Inviter Haka ID (optional) */}
          <View style={styles.field}>
            <Text style={styles.label}>Invited by Haka ID (optional)</Text>
            <View
              style={[
                styles.inputRow,
                errors.inviterHakaId ? styles.inputRowError : null,
              ]}
            >
              <Ionicons
                name="gift-outline"
                size={18}
                color="rgba(255,255,255,0.6)"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="e.g. 500000042"
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={inviterHakaId}
                onChangeText={(t) => {
                  setInviterHakaId(t.replace(/[^0-9]/g, '').slice(0, 9));
                  setErrors((prev) => ({ ...prev, inviterHakaId: '' }));
                }}
                keyboardType="number-pad"
                maxLength={9}
                returnKeyType="done"
              />
            </View>
            {errors.inviterHakaId ? (
              <Text style={styles.fieldError}>{errors.inviterHakaId}</Text>
            ) : null}
          </View>

          {errors.general ? <Text style={styles.generalError}>{errors.general}</Text> : null}

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.9}
          >
            <Text style={styles.submitText}>SUBMIT</Text>
          </TouchableOpacity>
        </KeyboardAwareScroll>
      </View>

      {/* ── Country Picker Modal ── */}
      <Modal visible={showCountry} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowCountry(false)} />
        <View style={[styles.sheetContainer, { paddingBottom: insets.bottom }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Select Country</Text>
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={16} color="#999" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search..."
              placeholderTextColor="#aaa"
              value={countrySearch}
              onChangeText={setCountrySearch}
              autoFocus
            />
          </View>
          <FlatList
            data={filteredCountries}
            keyExtractor={(item) => item.name}
            style={styles.countryList}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.countryItem, country === item.name && styles.countryItemSelected]}
                onPress={() => {
                  setCountry(item.name);
                  setCountrySearch('');
                  setShowCountry(false);
                  setErrors(e => ({ ...e, country: '' }));
                }}
              >
                <Text style={styles.countryFlag}>{item.flag}</Text>
                <Text style={[styles.countryName, country === item.name && styles.countryNameSelected]}>
                  {item.name}
                </Text>
                {country === item.name && (
                  <Ionicons name="checkmark" size={18} color="#7B4FFF" />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* ── Gender Picker Modal ── */}
      <Modal visible={showGender} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowGender(false)} />
        <View style={[styles.sheetContainer, styles.genderSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Select your gender</Text>
          {GENDERS.map((g) => {
            const selected = gender === g.value;
            return (
              <TouchableOpacity
                key={g.value}
                style={styles.genderItem}
                onPress={() => {
                  setGender(g.value);
                  setShowGender(false);
                  setErrors(e => ({ ...e, gender: '' }));
                }}
              >
                <MaterialCommunityIcons name={g.icon} size={22} color={selected ? '#7B4FFF' : '#555'} />
                <Text style={[styles.genderLabel, selected && styles.genderLabelSelected]}>
                  {g.label}
                </Text>
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </Modal>

      {/* ── Calendar Modal ── */}
      <Modal visible={showCal} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowCal(false)} />
        <View style={[styles.sheetContainer, styles.calSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHandle} />

          {/* Month navigation */}
          <View style={styles.calHeader}>
            <TouchableOpacity onPress={prevMonth} hitSlop={10}>
              <Ionicons name="chevron-back" size={20} color="#333" />
            </TouchableOpacity>
            <Text style={styles.calMonth}>{MONTHS[calMonth]} {calYear}</Text>
            <TouchableOpacity onPress={nextMonth} hitSlop={10}>
              <Ionicons name="chevron-forward" size={20} color="#333" />
            </TouchableOpacity>
          </View>

          {/* Day labels */}
          <View style={styles.calDayLabels}>
            {DAY_LABELS.map((d) => (
              <Text key={d} style={styles.calDayLabel}>{d}</Text>
            ))}
          </View>

          {/* Date grid */}
          <View style={styles.calGrid}>
            {calDays.map((day, i) => {
              if (!day) return <View key={`empty-${i}`} style={styles.calCell} />;
              const isSelected = selectedDay === day;
              const isToday = day === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
              return (
                <TouchableOpacity
                  key={`day-${day}`}
                  style={[styles.calCell, isSelected && styles.calCellSelected]}
                  onPress={() => {
                    setDob(new Date(calYear, calMonth, day));
                    setShowCal(false);
                    setErrors(e => ({ ...e, dob: '' }));
                  }}
                >
                  <Text style={[
                    styles.calDayNum,
                    isSelected && styles.calDayNumSelected,
                    isToday && !isSelected && styles.calDayNumToday,
                  ]}>
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const BG = '#5B2FD4';
const FIELD_BG = 'rgba(255,255,255,0.12)';
const FIELD_BORDER = 'rgba(255,255,255,0.25)';

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },

  // Scroll
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 4,
  },

  // Field
  field: {
    gap: 6,
    marginBottom: 12,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  immutable: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontStyle: 'italic',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FIELD_BG,
    borderWidth: 1,
    borderColor: FIELD_BORDER,
    borderRadius: 8,
    height: 50,
    paddingHorizontal: 14,
  },
  inputRowError: {
    borderColor: '#FF6B6B',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    height: '100%',
  },
  inputText: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
  },
  inputPlaceholder: {
    color: 'rgba(255,255,255,0.4)',
  },
  inputChevron: {
    marginLeft: 8,
  },
  fieldError: {
    color: '#FF6B6B',
    fontSize: 12,
    marginTop: 2,
  },
  cityHint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    marginTop: 6,
    lineHeight: 16,
  },
  generalError: {
    color: '#FF6B6B',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },

  // Submit button
  submitBtn: {
    backgroundColor: '#fff',
    borderRadius: 8,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitText: {
    color: '#7B4FFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // Modal shared
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  sheetContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '75%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
    marginBottom: 16,
  },

  // Country picker
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#333',
  },
  countryList: {
    flexGrow: 0,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEE',
  },
  countryItemSelected: {
    backgroundColor: '#F0ECFF',
    borderRadius: 8,
    paddingHorizontal: 8,
    marginHorizontal: -8,
  },
  countryFlag: {
    fontSize: 22,
  },
  countryName: {
    flex: 1,
    fontSize: 15,
    color: '#333',
  },
  countryNameSelected: {
    color: '#7B4FFF',
    fontWeight: '600',
  },

  // Gender picker
  genderSheet: {
    maxHeight: 340,
  },
  genderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEE',
  },
  genderLabel: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  genderLabelSelected: {
    color: '#7B4FFF',
    fontWeight: '600',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#CCC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#7B4FFF',
    backgroundColor: '#7B4FFF',
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },

  // Calendar
  calSheet: {
    maxHeight: 420,
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  calMonth: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  calDayLabels: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  calDayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calCellSelected: {
    backgroundColor: '#7B4FFF',
    borderRadius: 999,
  },
  calDayNum: {
    fontSize: 14,
    color: '#333',
  },
  calDayNumSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  calDayNumToday: {
    color: '#7B4FFF',
    fontWeight: '700',
  },
});
