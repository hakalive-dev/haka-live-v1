import { useState } from 'react';
import Constants from 'expo-constants';
import { useDispatch } from 'react-redux';
import { authApi } from '@api/auth';
import { AppDispatch } from '../store';
import { supabase } from '../lib/supabase';
import { persistAuthSession } from '../utils/persistAuthSession';
import { authTimingMark, logAuthTimingElapsed } from '../utils/authTiming';

const IS_EXPO_GO = Constants.appOwnership === 'expo';

let playServicesVerified = false;

function getGoogleSignin() {
  if (IS_EXPO_GO) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-google-signin/google-signin').GoogleSignin;
}

// Configure once — only in dev/prod builds where native modules exist
if (!IS_EXPO_GO) {
  try {
    const GoogleSignin = getGoogleSignin();
    GoogleSignin?.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
    });
  } catch (e) {
    console.warn('[GoogleAuth] configure failed:', e);
  }
}

export function useGoogleAuth() {
  const dispatch = useDispatch<AppDispatch>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    const GoogleSignin = getGoogleSignin();

    if (!GoogleSignin) {
      setError('Google Sign-in not available in Expo Go. Use a dev build.');
      return;
    }

    setLoading(true);
    setError(null);
    const t0 = authTimingMark();
    try {
      if (!playServicesVerified) {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        playServicesVerified = true;
      }
      const { data } = await GoogleSignin.signIn();
      logAuthTimingElapsed('google_native_done', t0);

      if (!data?.idToken) {
        throw new Error('Google did not return an ID token.');
      }

      if (!supabase) {
        throw new Error(
          'Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your .env file.',
        );
      }
      const tSupabase = authTimingMark();
      const { data: sessionData, error: sbError } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: data.idToken,
      });
      logAuthTimingElapsed('supabase_done', tSupabase);
      if (sbError || !sessionData.session) {
        throw new Error(sbError?.message ?? 'Supabase sign-in failed.');
      }

      const tBackend = authTimingMark();
      const result = await authApi.loginWithSupabase(sessionData.session.access_token);
      logAuthTimingElapsed('backend_auth_done', tBackend);

      await persistAuthSession(dispatch, result, 'google');
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err?.message ?? 'Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
      logAuthTimingElapsed('google_total', t0);
    }
  };

  return {
    promptAsync: signIn,
    isReady: !IS_EXPO_GO,
    loading,
    error,
    clearError: () => setError(null),
  };
};
