/**
 * Lightweight on-disk persistence for the React Query cache.
 *
 * Why not @tanstack/react-query-persist-client + AsyncStorage? AsyncStorage is
 * a native module (forces a rebuild) and the persist-client package is another
 * dependency. React Query already ships `dehydrate`/`hydrate`, and the app
 * already depends on `expo-file-system`, so we persist with zero new deps and
 * no native changes.
 *
 * Effect: on a warm launch, the last successful rooms/profile/inbox queries
 * paint instantly from disk, then refetch in the background (staleTime applies),
 * instead of showing blank screens while the network round-trips.
 */
import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';

import { logDiagnostic } from '../diagnostics/releaseDiagnostics';

const CACHE_FILE = `${FileSystem.documentDirectory ?? ''}rq-cache.json`;
/** Bump implicitly via app version — a new build discards an incompatible cache. */
const APP_VERSION = String(Constants.expoConfig?.version ?? '0');
/** Drop anything older than this so a user returning after days doesn't see stale data flash. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Don't persist a pathologically large cache (protects storage + write time). */
const MAX_BYTES = 2_000_000;
/** Coalesce bursty cache writes. */
const WRITE_THROTTLE_MS = 3_000;

type Persisted = { version: string; savedAt: number; state: unknown };

/**
 * Hydrate the cache from disk. Call once, before the first authenticated screen
 * mounts, so `useQuery` reads warm data immediately. Safe + silent on any error.
 */
export async function restoreQueryCache(queryClient: QueryClient): Promise<void> {
  try {
    if (!FileSystem.documentDirectory) return;
    const info = await FileSystem.getInfoAsync(CACHE_FILE);
    if (!info.exists) return;
    const raw = await FileSystem.readAsStringAsync(CACHE_FILE);
    const parsed = JSON.parse(raw) as Persisted;
    if (parsed.version !== APP_VERSION) return; // app updated → discard
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return; // too old → discard
    hydrate(queryClient, parsed.state as never);
  } catch (err) {
    logDiagnostic('lifecycle', 'rq_cache_restore_failed', {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Subscribe to cache changes and persist (throttled) to disk. Returns an
 * unsubscribe function. Only successful queries are dehydrated (React Query's
 * default), so in-flight/errored state is never written.
 */
export function startQueryCachePersistence(queryClient: QueryClient): () => void {
  if (!FileSystem.documentDirectory) return () => {};

  let timer: ReturnType<typeof setTimeout> | null = null;
  let writing = false;

  const flush = async () => {
    timer = null;
    if (writing) return;
    writing = true;
    try {
      const state = dehydrate(queryClient); // defaults to status === 'success'
      const payload = JSON.stringify({ version: APP_VERSION, savedAt: Date.now(), state } satisfies Persisted);
      if (payload.length > MAX_BYTES) return;
      await FileSystem.writeAsStringAsync(CACHE_FILE, payload);
    } catch {
      /* best-effort; a failed write just means a cold cache next launch */
    } finally {
      writing = false;
    }
  };

  const schedule = () => {
    if (timer) return;
    timer = setTimeout(flush, WRITE_THROTTLE_MS);
  };

  const unsub = queryClient.getQueryCache().subscribe(schedule);
  return () => {
    if (timer) clearTimeout(timer);
    unsub();
  };
}

/** Wipe persisted cache (e.g. on logout). */
export async function clearQueryCache(): Promise<void> {
  try {
    if (!FileSystem.documentDirectory) return;
    await FileSystem.deleteAsync(CACHE_FILE, { idempotent: true });
  } catch {
    /* ignore */
  }
}
