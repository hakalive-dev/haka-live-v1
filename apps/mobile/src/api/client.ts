import { logDiagnostic } from '../diagnostics/releaseDiagnostics';
import { TokenStorage } from '../storage';
import { store } from '../store';
import { setAuth, clearAuth } from '../store/authSlice';
import { getDeviceInfo } from '../utils/deviceInfo';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3010/api/v1';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export type RefreshOutcome =
  | { status: 'success'; accessToken: string }
  | { status: 'auth_failed' }
  | { status: 'network' };

export function getApiHost(): string {
  try {
    return new URL(API_BASE_URL).host;
  } catch {
    return 'unknown';
  }
}

/** User-facing message from any error thrown by apiClient. */
export function formatApiError(error: unknown): string {
  if (error instanceof Error) return error.message || 'Request failed';
  return 'Request failed';
}

type ParamValue = string | number | boolean | null | undefined;

export type RequestConfig = {
  timeout?: number;
  headers?: Record<string, string>;
  params?: Record<string, ParamValue>;
};

type FetchResponse<T = unknown> = { data: T; status: number };

type RequestSpec = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  config?: RequestConfig;
};

/** Default for most API calls — Render cold starts can exceed 10s on preview APKs. */
const DEFAULT_TIMEOUT = 25_000;
const NO_RETRY_RE = /\/auth\/(refresh|firebase|supabase|login|dev-login|dev-login-haka|logout)/;

let cachedAccessToken: string | null | undefined;
let cachedDeviceId: string | null | undefined;
let isRefreshing = false;
let refreshQueue: Array<(outcome: RefreshOutcome) => void> = [];
/** Dedupes concurrent refresh calls (401 retry + resume refresh share one rotation). */
let refreshInFlight: {
  promise: Promise<RefreshOutcome>;
  revokeOnFailure: boolean;
} | null = null;

export type RefreshSessionOptions = {
  /** When false, a failed refresh leaves stored tokens intact (proactive refresh only). Default true. */
  revokeSessionOnFailure?: boolean;
};

export function clearRequestAuthCache(): void {
  cachedAccessToken = undefined;
  cachedDeviceId = undefined;
}

export function setCachedAccessToken(token: string | null): void {
  cachedAccessToken = token;
}

export async function warmRequestAuthCache(): Promise<void> {
  cachedAccessToken = (await TokenStorage.getAccess()) ?? null;
  try {
    const device = await getDeviceInfo();
    cachedDeviceId = device.deviceId ?? null;
  } catch {
    cachedDeviceId = null;
  }
}

function buildUrl(path: string, params?: Record<string, ParamValue>): string {
  const url = `${API_BASE_URL}${path}`;
  if (!params) return url;
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null) as [string, string | number | boolean][];
  if (entries.length === 0) return url;
  const qs = new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
  return `${url}?${qs}`;
}

function drainQueue(outcome: RefreshOutcome) {
  refreshQueue.forEach(cb => cb(outcome));
  refreshQueue = [];
}

function refreshFailureError(outcome: RefreshOutcome): Error {
  if (outcome.status === 'network') {
    return new Error(
      `Network error (${getApiHost()}, ERR_NETWORK). Check your connection and try again.`,
    );
  }
  return new Error('Session expired, please log in again');
}

async function clearAuthState(): Promise<void> {
  clearRequestAuthCache();
  await TokenStorage.clear();
  store.dispatch(clearAuth());
}

async function performRefreshSession(
  shouldRevokeOnFailure: () => boolean,
): Promise<RefreshOutcome> {
  const refreshToken = await TokenStorage.getRefresh();
  if (!refreshToken) {
    if (shouldRevokeOnFailure()) await clearAuthState();
    return { status: 'auth_failed' };
  }
  try {
    const device = await getDeviceInfo();
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 30_000);
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
      body: JSON.stringify({ refreshToken, ...device }),
      signal: controller.signal,
    });
    clearTimeout(tid);

    if (res.status === 401 || res.status === 403) {
      logDiagnostic('auth', 'refresh_rejected', { status: res.status });
      if (shouldRevokeOnFailure()) await clearAuthState();
      return { status: 'auth_failed' };
    }

    if (!res.ok) {
      if (res.status >= 500) {
        logDiagnostic('api_http', 'auth_refresh_server_error', { status: res.status });
        clearRequestAuthCache();
        return { status: 'network' };
      }
      logDiagnostic('api_http', 'auth_refresh_failed', { status: res.status });
      if (shouldRevokeOnFailure()) await clearAuthState();
      return { status: 'auth_failed' };
    }

    const body = await res.json() as Record<string, unknown>;
    const tokens = (body?.data ?? body) as Record<string, unknown>;
    const newAccess = typeof tokens?.accessToken === 'string' ? tokens.accessToken : null;
    const newRefresh = typeof tokens?.refreshToken === 'string' ? tokens.refreshToken : null;
    if (!newAccess) {
      if (shouldRevokeOnFailure()) await clearAuthState();
      return { status: 'auth_failed' };
    }

    await TokenStorage.setAccess(newAccess);
    setCachedAccessToken(newAccess);
    if (newRefresh) await TokenStorage.setRefresh(newRefresh);
    const effectiveRefresh = newRefresh ?? refreshToken;

    let user = store.getState().auth.user;
    try {
      const meRes = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${newAccess}`,
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
      });
      if (meRes.ok) {
        const meBody = (await meRes.json()) as Record<string, unknown>;
        user = (meBody?.data ?? meBody) as typeof user;
        if (user) await TokenStorage.setUserJson(JSON.stringify(user));
      }
    } catch {
      /* keep cached user */
    }

    if (user && effectiveRefresh) {
      store.dispatch(setAuth({
        user,
        accessToken: newAccess,
        refreshToken: effectiveRefresh,
      }));
    }

    return { status: 'success', accessToken: newAccess };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    logDiagnostic(isAbort ? 'api_timeout' : 'api_network', 'auth_refresh_failed', {
      host: getApiHost(),
    });
    clearRequestAuthCache();
    return { status: 'network' };
  }
}

/** Refresh access token using stored refresh token. Exported for resume / startup flows. */
export async function refreshSession(
  options?: RefreshSessionOptions,
): Promise<RefreshOutcome> {
  const revokeSessionOnFailure = options?.revokeSessionOnFailure ?? true;
  if (refreshInFlight) {
    if (revokeSessionOnFailure) {
      refreshInFlight.revokeOnFailure = true;
    }
    return refreshInFlight.promise;
  }

  const flight = { revokeOnFailure: revokeSessionOnFailure };
  const promise = performRefreshSession(() => flight.revokeOnFailure).finally(() => {
    refreshInFlight = null;
  });
  refreshInFlight = { promise, revokeOnFailure: revokeSessionOnFailure };
  return promise;
}

function getBackendOrigin(): string {
  try {
    return new URL(API_BASE_URL).origin;
  } catch {
    return '';
  }
}

/**
 * Lightweight reachability probe used by the startup connectivity gate.
 * Resolves `true` if the backend answers with ANY HTTP response (even an error
 * status — that still proves the server is up), `false` on a network error or
 * timeout. Hits the unauthenticated `/health` endpoint.
 */
export async function checkBackendReachable(timeoutMs = 10_000): Promise<boolean> {
  const origin = getBackendOrigin();
  if (!origin) return false;
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const res = await fetch(`${origin}/health`, {
      headers: { 'ngrok-skip-browser-warning': 'true' },
      signal: controller.signal,
    });
    logDiagnostic('lifecycle', 'reachability_ok', {
      status: res.status,
      elapsedMs: Date.now() - startedAt,
    });
    return true;
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    logDiagnostic(isAbort ? 'api_timeout' : 'api_network', 'reachability_failed', {
      origin,
      elapsedMs: Date.now() - startedAt,
    });
    return false;
  } finally {
    clearTimeout(tid);
  }
}

async function _request<T>(spec: RequestSpec, _retry = false): Promise<FetchResponse<T>> {
  if (cachedAccessToken === undefined) {
    cachedAccessToken = (await TokenStorage.getAccess()) ?? null;
  }
  if (cachedDeviceId === undefined) {
    try {
      const device = await getDeviceInfo();
      cachedDeviceId = device.deviceId ?? null;
    } catch {
      cachedDeviceId = null;
    }
  }

  const isFormData = spec.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    'ngrok-skip-browser-warning': 'true',
    ...(spec.config?.headers ?? {}),
  };
  if (isFormData) delete headers['Content-Type'];
  if (cachedAccessToken) headers['Authorization'] = `Bearer ${cachedAccessToken}`;
  if (cachedDeviceId) headers['X-Device-Id'] = cachedDeviceId;

  const url = buildUrl(spec.path, spec.config?.params);
  const timeout = spec.config?.timeout ?? DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeout);
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await fetch(url, {
      method: spec.method,
      headers: {
        ...headers,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      cache: 'no-store',
      body: spec.body === undefined
        ? undefined
        : isFormData
          ? (spec.body as FormData)
          : JSON.stringify(spec.body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(tid);
    const host = getApiHost();
    const isAbort = err instanceof Error && err.name === 'AbortError';
    const elapsedMs = Date.now() - startedAt;
    logDiagnostic(isAbort ? 'api_timeout' : 'api_network', `${spec.method} ${spec.path}`, {
      host,
      timeoutMs: timeout,
      elapsedMs,
      retry: _retry,
    });
    throw new Error(isAbort
      ? `Request timed out (${host}). Check your connection and try again.`
      : `Network error (${host}, ERR_NETWORK)`);
  }
  clearTimeout(tid);

  if (response.status === 304) {
    throw new ApiError(
      'The server returned a cached empty response. Pull to refresh or try again.',
      304,
    );
  }

  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs >= 20_000) {
    logDiagnostic('api_slow', `${spec.method} ${spec.path}`, {
      status: response.status,
      elapsedMs,
    });
  }

  if (response.status === 401 && !_retry && !NO_RETRY_RE.test(spec.path)) {
    if (isRefreshing) {
      return new Promise<FetchResponse<T>>((resolve, reject) => {
        refreshQueue.push((outcome: RefreshOutcome) => {
          if (outcome.status !== 'success') {
            reject(refreshFailureError(outcome));
            return;
          }
          _request<T>({
            ...spec,
            config: {
              ...spec.config,
              headers: {
                ...spec.config?.headers,
                Authorization: `Bearer ${outcome.accessToken}`,
              },
            },
          }, true).then(resolve).catch(reject);
        });
      });
    }
    isRefreshing = true;
    let outcome: RefreshOutcome;
    try {
      outcome = await refreshSession();
    } finally {
      isRefreshing = false;
    }
    drainQueue(outcome);
    if (outcome.status !== 'success') {
      logDiagnostic('auth', 'session_refresh_failed_on_401', {
        path: spec.path,
        reason: outcome.status,
      });
      throw refreshFailureError(outcome);
    }
    return _request<T>({
      ...spec,
      config: {
        ...spec.config,
        headers: {
          ...spec.config?.headers,
          Authorization: `Bearer ${outcome.accessToken}`,
        },
      },
    }, true);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (!response.ok) {
      throw new ApiError(`Request failed (${response.status})`, response.status);
    }
    return { data: undefined as T, status: response.status };
  }

  if (typeof body === 'object' && body !== null && 'success' in body) {
    const env = body as { success: boolean; data: unknown; message?: string };
    if (env.success) return { data: env.data as T, status: response.status };
    logDiagnostic('api_http', `${spec.method} ${spec.path}`, {
      status: response.status,
      message: env.message,
    });
    throw new ApiError(env.message ?? 'Request failed', response.status);
  }

  if (!response.ok) {
    const msg = (body as Record<string, unknown>)?.message;
    const message = typeof msg === 'string' ? msg : `Request failed (${response.status})`;
    logDiagnostic('api_http', `${spec.method} ${spec.path}`, {
      status: response.status,
      message: typeof msg === 'string' ? msg : undefined,
    });
    throw new ApiError(message, response.status);
  }

  return { data: body as T, status: response.status };
}

export const apiClient = {
  get<T = any>(path: string, config?: RequestConfig): Promise<FetchResponse<T>> {
    return _request<T>({ method: 'GET', path, config });
  },
  post<T = any>(path: string, body?: unknown, config?: RequestConfig): Promise<FetchResponse<T>> {
    return _request<T>({ method: 'POST', path, body, config });
  },
  patch<T = any>(path: string, body?: unknown, config?: RequestConfig): Promise<FetchResponse<T>> {
    return _request<T>({ method: 'PATCH', path, body, config });
  },
  delete<T = any>(path: string, body?: unknown, config?: RequestConfig): Promise<FetchResponse<T>> {
    return _request<T>({ method: 'DELETE', path, body, config });
  },
};

/** Fire-and-forget warm-up ping so Render.com cold-starts complete before the user hits a real endpoint. */
export function pingBackend(): void {
  const origin = getBackendOrigin();
  if (!origin) return;
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 35_000);
  const healthStarted = Date.now();
  fetch(`${origin}/health`, {
    headers: { 'ngrok-skip-browser-warning': 'true' },
    signal: controller.signal,
  })
    .then((res) => {
      logDiagnostic('lifecycle', 'health_ping', {
        status: res.status,
        elapsedMs: Date.now() - healthStarted,
      });
    })
    .catch((err) => {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      logDiagnostic(isAbort ? 'api_timeout' : 'api_network', 'health_ping_failed', {
        origin,
        elapsedMs: Date.now() - healthStarted,
      });
    })
    .finally(() => clearTimeout(tid));
}
