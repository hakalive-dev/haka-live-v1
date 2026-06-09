import React, { useState } from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useDispatch } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import { AuthStackParamList } from '@navigation/types';
import { authApi } from '@api/auth';
import { AppDispatch } from '../../store';
import { persistAuthSession } from '../../utils/persistAuthSession';
import { authTimingMark, logAuthTimingElapsed } from '../../utils/authTiming';
import { KeyboardAwareScreen } from '@components/keyboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'LoginDirect'>;

const { height } = Dimensions.get('window');

export function LoginDirectScreen() {
  const navigation = useNavigation<Nav>();
  const dispatch = useDispatch<AppDispatch>();
  const insets = useSafeAreaInsets();

  const [hakaId, setHakaId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = hakaId.trim().length > 0 && password.length > 0 && !loading;

  const handleLogin = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    const t0 = authTimingMark();
    try {
      const trimmedId = hakaId.trim();
      const trimmedPw = password.trim();
      const tBackend = authTimingMark();
      const result = await authApi.loginWithHakaId(trimmedId, trimmedPw);
      logAuthTimingElapsed('backend_auth_done', tBackend);
      await persistAuthSession(dispatch, result, 'haka');
      void (async () => {
        const { saveAccountDisplayPassword, setPendingPasswordReveal } = await import(
          '../../utils/accountPasswordStorage'
        );
        await saveAccountDisplayPassword(result.user.id, trimmedPw);
        setPendingPasswordReveal(result.user.id, trimmedPw);
      })();
    } catch (e: any) {
      setError(e?.message || 'Invalid Haka ID or password');
    } finally {
      setLoading(false);
      logAuthTimingElapsed('haka_total', t0);
    }
  };

  return (
    <LinearGradient
      colors={['#7B4FFF', '#4A1FCC', '#2A0F8A']}
      style={styles.container}
    >
      {/* Back button */}
      <Pressable
        style={[styles.backBtn, { top: insets.top + 16 }]}
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
      </Pressable>

      {/* Logo */}
      <View
        style={[
          styles.logoSection,
          { marginTop: Math.max(height * 0.15, insets.top + 80) },
        ]}
      >
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logo}
          contentFit="contain"
        />
        <Text style={styles.title}>HAKA LIVE</Text>
      </View>

      <KeyboardAwareScreen style={styles.form}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.inputWrapper}>
          <Ionicons name="person-outline" size={20} color="#9090AA" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Haka ID (9 digits or VIP ID)"
            placeholderTextColor="#55556A"
            value={hakaId}
            onChangeText={(t) => { setHakaId(t); setError(''); }}
            autoCapitalize="none"
            keyboardType="number-pad"
          />
        </View>

        <View style={styles.inputWrapper}>
          <Ionicons name="lock-closed-outline" size={20} color="#9090AA" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#55556A"
            value={password}
            onChangeText={(t) => { setPassword(t); setError(''); }}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
          />
          <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
            <Ionicons
              name={showPassword ? 'eye-outline' : 'eye-off-outline'}
              size={20}
              color="#9090AA"
            />
          </Pressable>
        </View>

        <Pressable
          style={[styles.loginBtn, !canSubmit && styles.loginBtnDisabled]}
          onPress={handleLogin}
          disabled={!canSubmit}
        >
          <Text style={styles.loginBtnText}>
            {loading ? 'Logging in...' : 'Login'}
          </Text>
        </Pressable>
      </KeyboardAwareScreen>

      {/* Bottom text */}
      <Text style={[styles.footerText, { bottom: 50 + insets.bottom }]}>
        Use the Haka ID from Account settings (9-digit ID or VIP ID)
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 1,
  },
  form: {
    gap: 16,
  },
  errorText: {
    color: '#FF4D4D',
    fontSize: 13,
    textAlign: 'center',
    backgroundColor: 'rgba(255,77,77,0.15)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    overflow: 'hidden',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '400',
  },
  loginBtn: {
    height: 52,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  loginBtnDisabled: {
    opacity: 0.5,
  },
  loginBtnText: {
    color: '#7B4FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  footerText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    textAlign: 'center',
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
