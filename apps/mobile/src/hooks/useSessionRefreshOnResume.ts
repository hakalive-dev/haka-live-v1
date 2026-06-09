import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { refreshSession } from '../api/client';
import { logDiagnostic } from '../diagnostics/releaseDiagnostics';

const DEBOUNCE_MS = 60_000;

/**
 * Proactively refresh JWTs when the app returns to the foreground so the 15-minute
 * access token does not expire before the next API call.
 */
export function useSessionRefreshOnResume(enabled: boolean) {
  const lastRefreshAt = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;

      const now = Date.now();
      if (now - lastRefreshAt.current < DEBOUNCE_MS) return;

      void (async () => {
        // Proactive refresh must not clear the session on failure — the access token
        // may still be valid, and concurrent refresh (e.g. after image picker) must
        // not rotate the refresh token twice and force a logout.
        const outcome = await refreshSession({ revokeSessionOnFailure: false });
        if (outcome.status === 'success') {
          lastRefreshAt.current = Date.now();
        } else if (outcome.status === 'network') {
          logDiagnostic('session', 'resume_refresh_network_failed', {});
        } else if (outcome.status === 'auth_failed') {
          logDiagnostic('session', 'resume_refresh_auth_failed_keep_session', {});
        }
      })();
    });

    return () => sub.remove();
  }, [enabled]);
}
