import React, { useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  ImageBackground,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch } from 'react-redux';
import { AuthStackParamList } from '@navigation/types';
import { KeyboardAwareScreen } from '@components/keyboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { authApi } from '@api/auth';
import { whatsappOtpApi } from '@api/whatsappOtp';
import { formatApiError } from '@api/client';
import { TokenStorage } from '../../storage';
import { setAuth } from '../../store/authSlice';
import { AppDispatch } from '../../store';

const IS_EXPO_GO = Constants.appOwnership === 'expo';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Register'>;

const { width, height } = Dimensions.get('window');
const sX = width / 430;
const sY = height / 932;

const COUNTRIES = [
  { code: '+1',   flag: '🇺🇸', name: 'United States' },
  { code: '+1',   flag: '🇨🇦', name: 'Canada' },
  { code: '+7',   flag: '🇷🇺', name: 'Russia' },
  { code: '+20',  flag: '🇪🇬', name: 'Egypt' },
  { code: '+27',  flag: '🇿🇦', name: 'South Africa' },
  { code: '+30',  flag: '🇬🇷', name: 'Greece' },
  { code: '+31',  flag: '🇳🇱', name: 'Netherlands' },
  { code: '+32',  flag: '🇧🇪', name: 'Belgium' },
  { code: '+33',  flag: '🇫🇷', name: 'France' },
  { code: '+34',  flag: '🇪🇸', name: 'Spain' },
  { code: '+36',  flag: '🇭🇺', name: 'Hungary' },
  { code: '+39',  flag: '🇮🇹', name: 'Italy' },
  { code: '+40',  flag: '🇷🇴', name: 'Romania' },
  { code: '+41',  flag: '🇨🇭', name: 'Switzerland' },
  { code: '+43',  flag: '🇦🇹', name: 'Austria' },
  { code: '+44',  flag: '🇬🇧', name: 'United Kingdom' },
  { code: '+45',  flag: '🇩🇰', name: 'Denmark' },
  { code: '+46',  flag: '🇸🇪', name: 'Sweden' },
  { code: '+47',  flag: '🇳🇴', name: 'Norway' },
  { code: '+48',  flag: '🇵🇱', name: 'Poland' },
  { code: '+49',  flag: '🇩🇪', name: 'Germany' },
  { code: '+51',  flag: '🇵🇪', name: 'Peru' },
  { code: '+52',  flag: '🇲🇽', name: 'Mexico' },
  { code: '+54',  flag: '🇦🇷', name: 'Argentina' },
  { code: '+55',  flag: '🇧🇷', name: 'Brazil' },
  { code: '+56',  flag: '🇨🇱', name: 'Chile' },
  { code: '+57',  flag: '🇨🇴', name: 'Colombia' },
  { code: '+60',  flag: '🇲🇾', name: 'Malaysia' },
  { code: '+61',  flag: '🇦🇺', name: 'Australia' },
  { code: '+62',  flag: '🇮🇩', name: 'Indonesia' },
  { code: '+63',  flag: '🇵🇭', name: 'Philippines' },
  { code: '+64',  flag: '🇳🇿', name: 'New Zealand' },
  { code: '+65',  flag: '🇸🇬', name: 'Singapore' },
  { code: '+66',  flag: '🇹🇭', name: 'Thailand' },
  { code: '+81',  flag: '🇯🇵', name: 'Japan' },
  { code: '+82',  flag: '🇰🇷', name: 'South Korea' },
  { code: '+84',  flag: '🇻🇳', name: 'Vietnam' },
  { code: '+86',  flag: '🇨🇳', name: 'China' },
  { code: '+90',  flag: '🇹🇷', name: 'Turkey' },
  { code: '+91',  flag: '🇮🇳', name: 'India' },
  { code: '+92',  flag: '🇵🇰', name: 'Pakistan' },
  { code: '+93',  flag: '🇦🇫', name: 'Afghanistan' },
  { code: '+94',  flag: '🇱🇰', name: 'Sri Lanka' },
  { code: '+95',  flag: '🇲🇲', name: 'Myanmar' },
  { code: '+98',  flag: '🇮🇷', name: 'Iran' },
  { code: '+212', flag: '🇲🇦', name: 'Morocco' },
  { code: '+213', flag: '🇩🇿', name: 'Algeria' },
  { code: '+216', flag: '🇹🇳', name: 'Tunisia' },
  { code: '+218', flag: '🇱🇾', name: 'Libya' },
  { code: '+220', flag: '🇬🇲', name: 'Gambia' },
  { code: '+221', flag: '🇸🇳', name: 'Senegal' },
  { code: '+223', flag: '🇲🇱', name: 'Mali' },
  { code: '+224', flag: '🇬🇳', name: 'Guinea' },
  { code: '+225', flag: '🇨🇮', name: "Côte d'Ivoire" },
  { code: '+229', flag: '🇧🇯', name: 'Benin' },
  { code: '+230', flag: '🇲🇺', name: 'Mauritius' },
  { code: '+233', flag: '🇬🇭', name: 'Ghana' },
  { code: '+234', flag: '🇳🇬', name: 'Nigeria' },
  { code: '+237', flag: '🇨🇲', name: 'Cameroon' },
  { code: '+240', flag: '🇬🇶', name: 'Equatorial Guinea' },
  { code: '+243', flag: '🇨🇩', name: 'DR Congo' },
  { code: '+244', flag: '🇦🇴', name: 'Angola' },
  { code: '+245', flag: '🇬🇼', name: 'Guinea-Bissau' },
  { code: '+248', flag: '🇸🇨', name: 'Seychelles' },
  { code: '+249', flag: '🇸🇩', name: 'Sudan' },
  { code: '+250', flag: '🇷🇼', name: 'Rwanda' },
  { code: '+251', flag: '🇪🇹', name: 'Ethiopia' },
  { code: '+252', flag: '🇸🇴', name: 'Somalia' },
  { code: '+254', flag: '🇰🇪', name: 'Kenya' },
  { code: '+255', flag: '🇹🇿', name: 'Tanzania' },
  { code: '+256', flag: '🇺🇬', name: 'Uganda' },
  { code: '+260', flag: '🇿🇲', name: 'Zambia' },
  { code: '+263', flag: '🇿🇼', name: 'Zimbabwe' },
  { code: '+352', flag: '🇱🇺', name: 'Luxembourg' },
  { code: '+353', flag: '🇮🇪', name: 'Ireland' },
  { code: '+358', flag: '🇫🇮', name: 'Finland' },
  { code: '+370', flag: '🇱🇹', name: 'Lithuania' },
  { code: '+371', flag: '🇱🇻', name: 'Latvia' },
  { code: '+372', flag: '🇪🇪', name: 'Estonia' },
  { code: '+380', flag: '🇺🇦', name: 'Ukraine' },
  { code: '+381', flag: '🇷🇸', name: 'Serbia' },
  { code: '+385', flag: '🇭🇷', name: 'Croatia' },
  { code: '+386', flag: '🇸🇮', name: 'Slovenia' },
  { code: '+420', flag: '🇨🇿', name: 'Czech Republic' },
  { code: '+421', flag: '🇸🇰', name: 'Slovakia' },
  { code: '+502', flag: '🇬🇹', name: 'Guatemala' },
  { code: '+503', flag: '🇸🇻', name: 'El Salvador' },
  { code: '+504', flag: '🇭🇳', name: 'Honduras' },
  { code: '+505', flag: '🇳🇮', name: 'Nicaragua' },
  { code: '+506', flag: '🇨🇷', name: 'Costa Rica' },
  { code: '+507', flag: '🇵🇦', name: 'Panama' },
  { code: '+591', flag: '🇧🇴', name: 'Bolivia' },
  { code: '+593', flag: '🇪🇨', name: 'Ecuador' },
  { code: '+595', flag: '🇵🇾', name: 'Paraguay' },
  { code: '+598', flag: '🇺🇾', name: 'Uruguay' },
  { code: '+880', flag: '🇧🇩', name: 'Bangladesh' },
  { code: '+886', flag: '🇹🇼', name: 'Taiwan' },
  { code: '+960', flag: '🇲🇻', name: 'Maldives' },
  { code: '+961', flag: '🇱🇧', name: 'Lebanon' },
  { code: '+962', flag: '🇯🇴', name: 'Jordan' },
  { code: '+963', flag: '🇸🇾', name: 'Syria' },
  { code: '+964', flag: '🇮🇶', name: 'Iraq' },
  { code: '+965', flag: '🇰🇼', name: 'Kuwait' },
  { code: '+966', flag: '🇸🇦', name: 'Saudi Arabia' },
  { code: '+967', flag: '🇾🇪', name: 'Yemen' },
  { code: '+968', flag: '🇴🇲', name: 'Oman' },
  { code: '+970', flag: '🇵🇸', name: 'Palestine' },
  { code: '+971', flag: '🇦🇪', name: 'UAE' },
  { code: '+972', flag: '🇮🇱', name: 'Israel' },
  { code: '+973', flag: '🇧🇭', name: 'Bahrain' },
  { code: '+974', flag: '🇶🇦', name: 'Qatar' },
  { code: '+975', flag: '🇧🇹', name: 'Bhutan' },
  { code: '+976', flag: '🇲🇳', name: 'Mongolia' },
  { code: '+977', flag: '🇳🇵', name: 'Nepal' },
  { code: '+992', flag: '🇹🇯', name: 'Tajikistan' },
  { code: '+993', flag: '🇹🇲', name: 'Turkmenistan' },
  { code: '+994', flag: '🇦🇿', name: 'Azerbaijan' },
  { code: '+995', flag: '🇬🇪', name: 'Georgia' },
  { code: '+996', flag: '🇰🇬', name: 'Kyrgyzstan' },
  { code: '+998', flag: '🇺🇿', name: 'Uzbekistan' },
];

type Country = (typeof COUNTRIES)[0];

export function RegisterScreen() {
  const navigation = useNavigation<Nav>();
  const dispatch = useDispatch<AppDispatch>();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<Country>(COUNTRIES[0]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const filtered = search.trim()
    ? COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.code.includes(search),
      )
    : COUNTRIES;

  const fullPhone = `${country.code}${phone.trim()}`;

  const handleSend = async () => {
    if (!phone.trim()) {
      setError('Please enter your phone number.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      if (IS_EXPO_GO) {
        // Dev-only: bypass WhatsApp OTP, login directly with phone number
        const result = await authApi.devLogin(fullPhone);
        await TokenStorage.setAccess(result.tokens.accessToken);
        const { setCachedAccessToken } = await import('../../api/client');
        setCachedAccessToken(result.tokens.accessToken);
        await TokenStorage.setRefresh(result.tokens.refreshToken);
        await TokenStorage.setUserJson(JSON.stringify(result.user));
        dispatch(
          setAuth({
            user: result.user,
            accessToken: result.tokens.accessToken,
            refreshToken: result.tokens.refreshToken,
          }),
        );
        // Auth state change will auto-navigate to MainStack
        return;
      }

      await whatsappOtpApi.send(fullPhone);
      navigation.navigate('Verify', { phone_number: fullPhone });
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      source={require('../../assets/loginbg.webp')}
      style={styles.container}
      resizeMode="cover"
    >
      <View style={styles.scrim} />

      {/* ── Country picker modal ─────────────────────────────── */}
      <Modal
        visible={pickerVisible}
        animationType="slide"
        onRequestClose={() => setPickerVisible(false)}
      >
        <View style={[styles.modal, { paddingTop: insets.top + 16 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Country</Text>
            <Pressable onPress={() => setPickerVisible(false)}>
              <Ionicons name="close" size={24} color="#000" />
            </Pressable>
          </View>

          <TextInput
            style={styles.searchInput}
            placeholder="Search country or code..."
            placeholderTextColor="#888"
            value={search}
            onChangeText={setSearch}
            autoFocus
          />

          <FlatList
            data={filtered}
            keyExtractor={(item, i) => `${item.code}-${item.name}-${i}`}
            renderItem={({ item }) => (
              <Pressable
                style={styles.countryRow}
                onPress={() => {
                  setCountry(item);
                  setPickerVisible(false);
                  setSearch('');
                }}
              >
                <Text style={styles.countryFlag}>{item.flag}</Text>
                <Text style={styles.countryName}>{item.name}</Text>
                <Text style={styles.countryCode}>{item.code}</Text>
              </Pressable>
            )}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      </Modal>

      <KeyboardAwareScreen
        style={[
          styles.flex,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        {/* Logo */}
        <Image
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          source={require('../../assets/logo.png')}
          style={styles.logo}
        />

        {/* Form */}
        <View style={styles.formBlock}>
          <Text style={styles.heading}>Login to your account</Text>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Phone</Text>

            <View style={styles.inputRow}>
              {/* Country code picker trigger */}
              <Pressable
                style={styles.countryPicker}
                onPress={() => setPickerVisible(true)}
              >
                <Text style={styles.countryPickerFlag}>{country.flag}</Text>
                <Text style={styles.countryPickerCode}>{country.code}</Text>
                <Ionicons name="chevron-down" size={14} color="#fff" />
              </Pressable>

              <View style={styles.divider} />

              <TextInput
                style={styles.input}
                placeholder="Phone number"
                placeholderTextColor="rgba(255,255,255,0.5)"
                keyboardType="phone-pad"
                autoFocus
                value={phone}
                onChangeText={(t) => {
                  setError('');
                  setPhone(t.replace(/[^0-9]/g, ''));
                }}
                onSubmitEditing={() => handleSend()}
              />
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[
              styles.button,
              (!phone.trim() || loading) && styles.buttonDisabled,
            ]}
            onPress={() => handleSend()}
            disabled={!phone.trim() || loading}
          >
            <>
              <Ionicons name="logo-whatsapp" size={20} color="#800080" />
              <Text style={styles.buttonText}>
                {loading ? 'Sending…' : 'Send code via WhatsApp'}
              </Text>
            </>
          </Pressable>
        </View>

        {/* Support */}
        <Text style={[styles.support, { bottom: 105 * sY + insets.bottom }]}>
          Need help? Contact our support team...
        </Text>
      </KeyboardAwareScreen>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  logo: {
    width: 86 * sX,
    height: 80 * sY,
    alignSelf: 'center',
    marginTop: 110 * sY,
  },
  formBlock: {
    position: 'absolute',
    left: 25 * sX,
    top: 250 * sY,
    width: 380 * sX,
    gap: 22 * sY,
  },
  heading: {
    color: '#fff',
    fontFamily: 'Poppins',
    fontWeight: '600',
    fontSize: 16,
    lineHeight: 24,
  },
  fieldBlock: { gap: 6 * sY },
  fieldLabel: {
    color: '#fff',
    fontFamily: 'Poppins',
    fontWeight: '400',
    fontSize: 16,
    lineHeight: 24,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56 * sY,
    borderWidth: 1,
    borderColor: '#898483',
    borderRadius: 10,
    paddingHorizontal: 14 * sX,
    gap: 0,
    overflow: 'hidden',
  },
  countryPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: 10 * sX,
  },
  countryPickerFlag: { fontSize: 20 },
  countryPickerCode: {
    color: '#fff',
    fontFamily: 'Poppins',
    fontWeight: '400',
    fontSize: 14,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: '#898483',
    marginRight: 10 * sX,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontFamily: 'Poppins',
    fontWeight: '400',
    fontSize: 16,
    lineHeight: 24,
  },
  error: {
    color: '#ff6b6b',
    fontSize: 13,
    fontFamily: 'Poppins',
  },
  button: {
    height: 55 * sY,
    backgroundColor: '#fff',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: '#800080',
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 16,
    lineHeight: 19,
  },
  support: {
    position: 'absolute',
    width: 236 * sX,
    left: (width - 236 * sX) / 2,
    color: '#fff',
    fontFamily: 'Poppins',
    fontWeight: '400',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  // ── Country picker modal ──────────────────────────────────────
  modal: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  searchInput: {
    margin: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    fontSize: 15,
    color: '#000',
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    gap: 12,
  },
  countryFlag: { fontSize: 24 },
  countryName: { flex: 1, fontSize: 15, color: '#000' },
  countryCode: { fontSize: 15, color: '#555', fontWeight: '600' },
});
