import { refreshSession } from '@api/client';
import { logDiagnostic } from '../diagnostics/releaseDiagnostics';
import { TokenStorage } from '../storage';

// Access tokens expire after ~15 min. REST recovers via the 401→refresh
// interceptor, but Socket.io handshakes send a static `auth.token`, so a stale
// token makes every connect attempt fail ("Invalid or expired token").
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

/** Decode a JWT's `exp` (ms since epoch) without verifying — null when unreadable. */
export function decodeJwtExpMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { exp?: number };
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Stored access token, refreshed first when absent or expiring within the margin.
 *  `force` skips the local expiry check — for when the server already rejected it. */
export async function getFreshSocketToken(force = false): Promise<string | null> {
  const stored = await TokenStorage.getAccess();
  const expMs = stored ? decodeJwtExpMs(stored) : null;
  if (!force && stored && expMs !== null && expMs - Date.now() > TOKEN_EXPIRY_MARGIN_MS) {
    return stored;
  }
  const outcome = await refreshSession({ revokeSessionOnFailure: false });
  if (outcome.status === 'success') return outcome.accessToken;
  logDiagnostic('socket', 'token_refresh_failed', { status: outcome.status });
  return stored;
}

export function getSocketBaseUrl(): string {
  return (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3010/api/v1').replace(
    '/api/v1',
    '',
  );
}
