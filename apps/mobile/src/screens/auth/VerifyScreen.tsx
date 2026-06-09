import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  ImageBackground,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useDispatch } from 'react-redux';
import { AuthStackParamList, AuthStackScreenProps } from '@navigation/types';
import { whatsappOtpApi } from '@api/whatsappOtp';
import { formatApiError } from '@api/client';
import { AppDispatch } from '../../store';
import { persistAuthSession } from '../../utils/persistAuthSession';
import { authTimingMark, logAuthTimingElapsed } from '../../utils/authTiming';
import { KeyboardAwareScreen } from '@components/keyboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Verify'>;
type Route = AuthStackScreenProps<'Verify'>['route'];

const { width, height } = Dimensions.get('window');
const sX = width / 430;
const sY = height / 932;

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

export function VerifyScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const dispatch = useDispatch<AppDispatch>();
  const insets = useSafeAreaInsets();

  const { phone_number } = route.params;
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const inputRefs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const handleChange = (text: string, index: number) => {
    const digit = text.replace(/[^0-9]/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    setError('');
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    if (next.every((d) => d !== '')) {
      verify(next.join(''));
    }
  };

  const handleKeyPress = (
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number,
  ) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const verify = async (code: string) => {
    setLoading(true);
    setError('');
    const t0 = authTimingMark();
    try {
      // Single backend call: verifies the OTP, find-or-creates the user by phone,
      // and returns app JWTs + user (no separate Supabase exchange step).
      const tBackend = authTimingMark();
      const result = await whatsappOtpApi.verifyLogin(phone_number, code);
      logAuthTimingElapsed('backend_auth_done', tBackend);

      if (!result.user.onboardingComplete) {
        // Navigate to Onboarding BEFORE dispatching setAuth so RootNavigator
        // doesn't switch to MainStack while we still need the AuthStack.
        await persistAuthSession(dispatch, result, 'phone', { skipDispatch: true });
        navigation.navigate('Onboarding', {});
      } else {
        await persistAuthSession(dispatch, result, 'phone');
      }
    } catch (e: unknown) {
      setError(formatApiError(e) || 'Invalid code. Try again.');
      setDigits(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
      logAuthTimingElapsed('phone_verify_total', t0);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    try {
      await whatsappOtpApi.send(phone_number);
      setCountdown(RESEND_SECONDS);
      setDigits(Array(OTP_LENGTH).fill(''));
      setError('');
      inputRefs.current[0]?.focus();
    } catch (e: unknown) {
      setError(formatApiError(e) || 'Failed to resend. Try again.');
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

      <View
        style={styles.content}
        pointerEvents="box-none"
      >
      {/* Back arrow */}
      <Pressable style={[styles.back, { top: Math.max(81 * sY, insets.top + 12) }]} onPress={() => navigation.goBack()}>
        <Text style={styles.backArrow}>{'<'}</Text>
      </Pressable>

      {/* Title */}
      <Text style={[styles.title, { top: Math.max(78 * sY, insets.top + 12) }]}>Account Verification</Text>

      {/* Subtitle */}
      <Text style={styles.subtitle}>Verify your Phone number</Text>

      {/* Description */}
      <Text style={styles.description}>
        We have sent a six digit verification code to your WhatsApp. Please enter it below.
      </Text>

      <KeyboardAwareScreen
        style={[styles.keyboardWrap, { paddingBottom: 48 }]}
      >
      {/* OTP boxes */}
      <View style={styles.otpRow}>
        {digits.map((digit, i) => (
          <TextInput
            key={i}
            ref={(r) => {
              inputRefs.current[i] = r;
            }}
            style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
            value={digit}
            onChangeText={(t) => handleChange(t, i)}
            onKeyPress={(e) => handleKeyPress(e, i)}
            keyboardType="number-pad"
            maxLength={1}
            autoFocus={i === 0}
            selectTextOnFocus
            textAlign="center"
          />
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Verify button */}
      <Pressable
        style={[
          styles.button,
          (loading || digits.some((d) => !d)) && styles.buttonDisabled,
        ]}
        onPress={() => verify(digits.join(''))}
        disabled={loading || digits.some((d) => !d)}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Verifying...' : 'Verify'}
        </Text>
      </Pressable>

      {/* Resend */}
      <Pressable onPress={handleResend} disabled={countdown > 0}>
        <Text style={styles.resend}>
          {countdown > 0
            ? `Didn't receive the code? Resend in ${countdown} seconds`
            : "Didn't receive the code? Resend now"}
        </Text>
      </Pressable>
      </KeyboardAwareScreen>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    ...StyleSheet.absoluteFillObject,
  },
  keyboardWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  back: {
    position: 'absolute',
    left: 25 * sX,
  },
  backArrow: {
    color: '#fff',
    fontSize: 28,
    fontFamily: 'Poppins',
    fontWeight: '400',
    lineHeight: 34,
  },
  title: {
    position: 'absolute',
    width: 208 * sX,
    left: (width - 208 * sX) / 2,
    color: '#fff',
    fontFamily: 'Poppins',
    fontWeight: '600',
    fontSize: 20,
    lineHeight: 30,
    textAlign: 'center',
  },
  subtitle: {
    position: 'absolute',
    width: 212 * sX,
    left: (width - 212 * sX) / 2,
    top: 190 * sY,
    color: '#fff',
    fontFamily: 'Poppins',
    fontWeight: '600',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  description: {
    position: 'absolute',
    width: 361 * sX,
    left: (width - 361 * sX) / 2,
    top: 237 * sY,
    color: '#fff',
    fontFamily: 'Poppins',
    fontWeight: '400',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  otpRow: {
    position: 'absolute',
    flexDirection: 'row',
    width: 370 * sX,
    left: (width - 370 * sX) / 2,
    top: 328 * sY,
    gap: 14 * sX,
    alignItems: 'center',
  },
  otpBox: {
    width: 50 * sX,
    height: 50 * sX,
    backgroundColor: '#D9D9D9',
    borderRadius: 8,
    color: '#000',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  otpBoxFilled: {
    backgroundColor: '#fff',
  },
  error: {
    position: 'absolute',
    left: (width - 370 * sX) / 2,
    top: 390 * sY,
    color: '#ff6b6b',
    fontSize: 13,
    fontFamily: 'Poppins',
    width: 370 * sX,
    textAlign: 'center',
  },
  button: {
    position: 'absolute',
    width: 380 * sX,
    height: 55 * sY,
    left: (width - 380 * sX) / 2,
    top: 504 * sY,
    backgroundColor: '#fff',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#A689E1',
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 16,
    lineHeight: 19,
  },
  resend: {
    position: 'absolute',
    width: 369 * sX,
    left: (width - 369 * sX) / 2,
    top: 579 * sY,
    color: '#fff',
    fontFamily: 'Poppins',
    fontWeight: '400',
    fontSize: 14,
    lineHeight: 24,
    textAlign: 'center',
  },
});
