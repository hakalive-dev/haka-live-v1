/**
 * Single shared Socket.io connection for DMs (provider mounted in RootNavigator).
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { io as ioClient, Socket as SocketIOClient } from 'socket.io-client';

import { queryKeys } from '@api/queryKeys';
import { TokenStorage } from '../storage';
import type { RootState } from '../store';
import type { DirectMessage } from '@/types';

export interface DMWsEvent {
  event: 'new_dm' | 'dm:deleted';
  data: Record<string, unknown>;
}

type DMConnectionContextValue = {
  dmEvent: DMWsEvent | null;
  teamAnnouncementRevision: number;
};

const DMConnectionContext = createContext<DMConnectionContextValue | null>(null);

export function invalidateChatUnreadQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.chat.inbox() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.chat.messagesBadge() });
}

export function DMConnectionProvider({
  children,
  enabled,
}: {
  children: React.ReactNode;
  enabled: boolean;
}) {
  const [dmEvent, setDmEvent] = useState<DMWsEvent | null>(null);
  const [teamAnnouncementRevision, setTeamAnnouncementRevision] = useState(0);
  const socket = useRef<SocketIOClient | null>(null);
  const currentUserId = useSelector((s: RootState) => s.auth.user?.id);
  const queryClient = useQueryClient();

  const disconnect = useCallback(() => {
    if (socket.current) {
      socket.current.disconnect();
      socket.current = null;
    }
  }, []);

  const connect = useCallback(async () => {
    if (!enabled) return;
    const token = await TokenStorage.getAccess();
    if (!token) return;

    disconnect();

    const baseUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3010/api/v1').replace(
      '/api/v1',
      '',
    );

    const client = ioClient(baseUrl, {
      transports: ['websocket'],
      auth: { token },
    });
    socket.current = client;

    client.on('new_dm', (data: Record<string, unknown>) => {
      setDmEvent({ event: 'new_dm', data });
      const msg = data as unknown as DirectMessage;
      if (msg.recipient?.id === currentUserId) {
        invalidateChatUnreadQueries(queryClient);
      }
    });

    client.on('dm:deleted', (data: Record<string, unknown>) => {
      setDmEvent({ event: 'dm:deleted', data });
    });

    client.on('team_announcement_updated', () => {
      setTeamAnnouncementRevision((n) => n + 1);
    });

    client.on('connect_error', (err) => {
      console.warn('[DM Socket.io] connect error:', err.message);
    });
  }, [enabled, currentUserId, disconnect, queryClient]);

  useEffect(() => {
    if (!enabled) {
      disconnect();
      return;
    }
    void connect();
    return () => disconnect();
  }, [enabled, connect, disconnect]);

  const value = React.useMemo(
    () => ({ dmEvent, teamAnnouncementRevision }),
    [dmEvent, teamAnnouncementRevision],
  );

  return (
    <DMConnectionContext.Provider value={value}>{children}</DMConnectionContext.Provider>
  );
}

export function useDMConnection(): DMConnectionContextValue {
  const ctx = useContext(DMConnectionContext);
  if (!ctx) {
    throw new Error('useDMConnection must be used within DMConnectionProvider');
  }
  return ctx;
}
