import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AuthStackParamList } from '@navigation/types';
import { pingBackend, warmRequestAuthCache } from '../../api/client';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';
import { useAppleAuth } from '../../hooks/useAppleAuth';
import { HAKA_LOGO_MARK } from '@/constants/app-logo';
import { Colors } from '@/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GoogleLogo from '../../../assets/auth/google-logo.svg';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

const { width, height } = Dimensions.get('window');
const sX = width / 430;
const sY = height / 932;

export function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const {
    promptAsync,
    isReady,
    loading: googleLoading,
    error: googleError,
    clearError: clearGoogleError,
  } = useGoogleAuth();
  const {
    promptAsync: promptAppleAsync,
    isReady: isAppleReady,
    loading: appleLoading,
    error: appleError,
    clearError: clearAppleError,
  } = useAppleAuth();
  const authLoading = googleLoading || appleLoading;
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    void warmRequestAuthCache();
    pingBackend();
  }, []);

  const authError = googleError ?? appleError;
  const clearAuthError = () => {
    clearGoogleError();
    clearAppleError();
  };

  return (
    <View style={styles.container}>
      <ExpoImage
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source={require('../../assets/loginbg.webp')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        priority="high"
      />
      <View style={styles.scrim} />

      {authLoading ? (
        <View style={styles.loadingOverlay} pointerEvents="box-none">
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Signing in…</Text>
        </View>
      ) : null}

      <View
        style={styles.content}
        pointerEvents="box-none"
      >
      {/* ── Brand ─────────────────────────────────────────── */}
      <View style={[styles.brand, { top: Math.max(81 * sY, insets.top + 12) }]}>
        <View style={styles.logoClip}>
          <ExpoImage
            source={HAKA_LOGO_MARK}
            style={styles.logoImg}
            contentFit="contain"
          />
        </View>
        <View style={styles.brandText}>
          <Text style={styles.appName}>HAKA LIVE</Text>
          <Text style={styles.tagline}>
            From Strangeness to friendship to intimacy
          </Text>
        </View>
      </View>

      {/* ── Auth options ───────────────────────────────────── */}
      <View style={styles.authBox}>
        {authError ? (
          <Pressable onPress={clearAuthError}>
            <Text style={styles.errorBanner}>{authError}{'\n'}(tap to dismiss)</Text>
          </Pressable>
        ) : null}
        {/* Primary buttons */}
        <View style={styles.primaryButtons}>
          <Pressable
            style={[styles.pill, (!isReady || !termsAccepted || authLoading) && styles.pillDisabled]}
            onPress={() => promptAsync()}
            disabled={!isReady || !termsAccepted || authLoading}
          >
            <GoogleLogo width={30} height={30} />
            <Text style={styles.pillText}>Log in with Google</Text>
          </Pressable>

          {Platform.OS === 'ios' && isAppleReady ? (
            <Pressable
              style={[styles.pill, (!termsAccepted || authLoading) && styles.pillDisabled]}
              onPress={() => promptAppleAsync()}
              disabled={!termsAccepted || authLoading}
            >
              <Ionicons name="logo-apple" size={30} color="#000" />
              <Text style={styles.pillText}>Log in with Apple</Text>
            </Pressable>
          ) : null}

          {/* Hidden until WhatsApp OTP number is provisioned — restore to re-enable phone login */}
          {/* <Pressable
            style={[styles.pill, !termsAccepted && styles.pillDisabled]}
            onPress={() => termsAccepted && navigation.navigate('Register')}
            disabled={!termsAccepted}
          >
            <MaterialCommunityIcons name="cellphone" size={30} color="#000" />
            <Text style={styles.pillText}>Log in with Phone</Text>
          </Pressable> */}
        </View>

        {/* More login methods */}
        <View style={styles.moreSection}>
          <Text style={styles.moreLabel}>More Login Methods</Text>

          <View style={styles.iconRow}>
            <Pressable
              style={[styles.iconCircle, !termsAccepted && styles.iconCircleDisabled]}
              onPress={() => termsAccepted && navigation.navigate('LoginDirect')}
              disabled={!termsAccepted}
            >
              <Ionicons name="person" size={30} color="#000" />
            </Pressable>
          </View>
        </View>

        {/* Terms */}
        <Pressable
          style={styles.termsRow}
          onPress={() => setTermsAccepted((v) => !v)}
        >
          <View style={[styles.checkbox, termsAccepted && styles.checkboxActive]} />
          <Pressable onPress={() => navigation.navigate('Terms')} hitSlop={8}>
            <Text style={styles.termsText}>
              I have read and agreed the Haka Live{' '}
              <Text style={styles.termsLink}>
                Terms Of Service &amp; Privacy Policy
              </Text>
            </Text>
          </Pressable>
        </Pressable>
      </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    ...StyleSheet.absoluteFillObject,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    gap: 12,
  },
  loadingText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  // ── Brand ──────────────────────────────────────────────────
  brand: {
    position: 'absolute',
    left: 21 * sX,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10 * sX,
  },
  logoImg: {
    width: 58 * sX,
    height: 58 * sX,
    borderRadius: 16 * sX,
  },
  logoClip: {
    width: 58 * sX,
    height: 58 * sX,
    borderRadius: 16 * sX,
    overflow: 'hidden',
  },
  brandText: {
    gap: 2,
  },
  appName: {
    color: '#fff',
    fontFamily: 'Podkova-SemiBold',
    fontWeight: '600',
    fontSize: 15,
    letterSpacing: -0.33,
  },
  tagline: {
    color: '#fff',
    fontFamily: 'Inter',
    fontWeight: '400',
    fontSize: 12,
    letterSpacing: -0.33,
  },
  // ── Auth box ───────────────────────────────────────────────
  authBox: {
    position: 'absolute',
    left: 42 * sX,
    top: 485 * sY,
    width: 347 * sX,
    gap: 20 * sY,
  },
  primaryButtons: {
    gap: 10 * sY,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 21 * sX,
    gap: 53 * sX,
    height: 60 * sY,
    backgroundColor: '#fff',
    borderRadius: 30,
  },
  pillDisabled: {
    opacity: 0.6,
  },
  pillText: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 16,
    color: '#000',
    letterSpacing: -0.33,
  },
  // ── More methods ───────────────────────────────────────────
  moreSection: {
    alignItems: 'center',
    gap: 22 * sY,
  },
  moreLabel: {
    color: '#fff',
    fontFamily: 'Poppins',
    fontWeight: '400',
    fontSize: 12,
    letterSpacing: -0.33,
  },
  iconRow: {
    flexDirection: 'row',
    gap: 23 * sX,
  },
  iconCircle: {
    width: 60 * sX,
    height: 60 * sX,
    borderRadius: 30,
    backgroundColor: '#D9D9D9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleDisabled: {
    opacity: 0.6,
  },
  errorBanner: {
    backgroundColor: 'rgba(220,50,50,0.85)',
    color: '#fff',
    fontSize: 13,
    padding: 10,
    borderRadius: 8,
    textAlign: 'center',
    lineHeight: 18,
  },
  // ── Terms ──────────────────────────────────────────────────
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 21 * sX,
    gap: 10,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'transparent',
    marginTop: 1,
  },
  checkboxActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  termsText: {
    flex: 1,
    color: '#fff',
    fontFamily: 'Poppins',
    fontWeight: '300',
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: -0.33,
  },
  termsLink: {
    textDecorationLine: 'underline',
    color: '#fff',
  },
});
