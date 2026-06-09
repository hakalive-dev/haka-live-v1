import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { useDispatch } from 'react-redux';
import { authApi } from '@api/auth';
import { AppDispatch } from '../store';
import { supabase } from '../lib/supabase';
import { persistAuthSession } from '../utils/persistAuthSession';
import { authTimingMark, logAuthTimingElapsed } from '../utils/authTiming';

const IS_EXPO_GO = Constants.appOwnership === 'expo';
const IS_IOS = Platform.OS === 'ios';

function getAppleAuthentication() {
  if (!IS_IOS || IS_EXPO_GO) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-apple-authentication') as typeof import('expo-apple-authentication');
  } catch {
    return null;
  }
}

export function useAppleAuth() {
  const dispatch = useDispatch<AppDispatch>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const AppleAuthentication = getAppleAuthentication();
      if (!AppleAuthentication) {
        if (!cancelled) setIsReady(false);
        return;
      }
      try {
        const available = await AppleAuthentication.isAvailableAsync();
        if (!cancelled) setIsReady(available);
      } catch {
        if (!cancelled) setIsReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = async () => {
    const AppleAuthentication = getAppleAuthentication();

    if (!IS_IOS) {
      setError('Sign in with Apple is only available on iOS.');
      return;
    }

    if (!AppleAuthentication) {
      setError('Sign in with Apple is not available in Expo Go. Use a dev build.');
      return;
    }

    if (!isReady) {
      setError('Sign in with Apple is not available on this device.');
      return;
    }

    setLoading(true);
    setError(null);
    const t0 = authTimingMark();
    try {
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      logAuthTimingElapsed('apple_native_done', t0);

      if (!credential.identityToken) {
        throw new Error('Apple did not return an identity token.');
      }

      if (!supabase) {
        throw new Error(
          'Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your .env file.',
        );
      }

      const tSupabase = authTimingMark();
      const { data: sessionData, error: sbError } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });
      logAuthTimingElapsed('supabase_done', tSupabase);
      if (sbError || !sessionData.session) {
        throw new Error(sbError?.message ?? 'Supabase sign-in failed.');
      }

      const tBackend = authTimingMark();
      const result = await authApi.loginWithSupabase(sessionData.session.access_token);
      logAuthTimingElapsed('backend_auth_done', tBackend);

      await persistAuthSession(dispatch, result, 'apple');
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err?.code === 'ERR_REQUEST_CANCELED') {
        return;
      }
      setError(err?.message ?? 'Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
      logAuthTimingElapsed('apple_total', t0);
    }
  };

  return {
    promptAsync: signIn,
    isReady: IS_IOS && !IS_EXPO_GO && isReady,
    loading,
    error,
    clearError: () => setError(null),
  };
};
