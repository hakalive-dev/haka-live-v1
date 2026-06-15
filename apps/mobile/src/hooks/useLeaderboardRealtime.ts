import { useCallback, useEffect, useRef } from 'react';
import { io as ioClient, Socket as SocketIOClient } from 'socket.io-client';
import { getFreshSocketToken, getSocketBaseUrl } from '../utils/socketAuth';
import { logDiagnostic } from '../diagnostics/releaseDiagnostics';

const EVENTS = {
  SUBSCRIBE: 'leaderboard:subscribe',
  UNSUBSCRIBE: 'leaderboard:unsubscribe',
  CHANGED: 'leaderboard:changed',
} as const;

export type RealtimeBoard = 'agent' | 'creator' | 'state';

type Params = {
  board: RealtimeBoard;
  /** Period for agent/creator boards. */
  period?: 'daily' | 'weekly' | 'monthly';
  /** Country code for the state board (it is keyed per country, always daily). */
  countryCode?: string;
  enabled: boolean;
  /** Called when the server signals this board changed — refetch the REST query here. */
  onChanged: () => void;
};

/**
 * Subscribes to a ranking board's live-change signal while the tab is active. The server
 * emits `leaderboard:changed` (a tiny signal, not the data) at most every few seconds and
 * only when the top-N actually changed; we respond by refetching the existing REST query,
 * so all the data shaping stays in one place. Falls back silently to the screen's normal
 * polling if the socket can't connect.
 */
export function useLeaderboardRealtime({ board, period, countryCode, enabled, onChanged }: Params): void {
  const socketRef = useRef<SocketIOClient | null>(null);
  // Keep the latest callback without re-running the connect effect on every render.
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  const disconnect = useCallback(() => {
    const client = socketRef.current;
    if (!client) return;
    socketRef.current = null;
    client.removeAllListeners();
    client.disconnect();
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    void (async () => {
      const token = await getFreshSocketToken();
      if (!token || cancelled) return;

      const client = ioClient(getSocketBaseUrl(), {
        transports: ['websocket'],
        auth: { token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });
      socketRef.current = client;

      const subscribe = () => client.emit(EVENTS.SUBSCRIBE, { board, period, countryCode });

      client.on('connect', subscribe); // also re-subscribes after a reconnect
      client.on(EVENTS.CHANGED, (payload: { board?: string; period?: string; countryCode?: string }) => {
        if (payload?.board !== board) return;
        const matches = board === 'state' ? payload?.countryCode === countryCode : payload?.period === period;
        if (matches) onChangedRef.current();
      });
      client.on('connect_error', (err) => {
        logDiagnostic('socket', 'leaderboard_connect_error', { message: err.message });
      });
    })();

    return () => {
      cancelled = true;
      const client = socketRef.current;
      if (client?.connected) client.emit(EVENTS.UNSUBSCRIBE, { board, period, countryCode });
      disconnect();
    };
  }, [board, period, countryCode, enabled, disconnect]);
}
