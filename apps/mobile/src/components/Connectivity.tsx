import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { checkBackendReachable } from '@api/client';

/**
 * Tracks whether the backend is reachable so the UI can show a connection
 * gate/banner instead of a blank white screen when the API is down or in a
 * (slow) cold start. `reachable === null` means "not yet determined".
 */
interface ConnectivityValue {
  reachable: boolean | null;
  checking: boolean;
  /** Force a fresh reachability check (e.g. from a Retry button). */
  recheck: () => void;
}

const ConnectivityContext = createContext<ConnectivityValue>({
  reachable: null,
  checking: false,
  recheck: () => {},
});

/** Re-probe while unreachable — spaced out so we don't stack 25s probes. */
const AUTO_RETRY_MS = 45_000;

export function ConnectivityProvider({ children }: React.PropsWithChildren) {
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const inFlight = useRef(false);
  const seq = useRef(0);

  const run = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const mySeq = ++seq.current;
    setChecking(true);
    try {
      const ok = await checkBackendReachable();
      // Ignore stale results if a newer check started.
      if (mySeq === seq.current) setReachable(ok);
    } finally {
      if (mySeq === seq.current) setChecking(false);
      inFlight.current = false;
    }
  }, []);

  const recheck = useCallback(() => {
    void run();
  }, [run]);

  // Initial probe on mount.
  useEffect(() => {
    void run();
  }, [run]);

  // Gentle auto-retry while unreachable so a cold-starting backend self-heals
  // without the user having to tap Retry.
  useEffect(() => {
    if (reachable !== false) return;
    const id = setInterval(() => void run(), AUTO_RETRY_MS);
    return () => clearInterval(id);
  }, [reachable, run]);

  // Re-probe when the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void run();
    });
    return () => sub.remove();
  }, [run]);

  // Memoize so consumers don't re-render on every provider render (only when
  // reachable/checking actually change).
  const value = useMemo<ConnectivityValue>(
    () => ({ reachable, checking, recheck }),
    [reachable, checking, recheck],
  );

  return (
    <ConnectivityContext.Provider value={value}>
      {children}
    </ConnectivityContext.Provider>
  );
}

export function useConnectivity(): ConnectivityValue {
  return useContext(ConnectivityContext);
}
