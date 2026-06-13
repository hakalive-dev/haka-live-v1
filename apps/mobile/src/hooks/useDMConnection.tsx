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
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { io as ioClient, Socket as SocketIOClient } from 'socket.io-client';

import { queryKeys } from '@api/queryKeys';
import type { ChatInboxData } from '@hooks/queries/useChatInboxQuery';
import { logDiagnostic } from '../diagnostics/releaseDiagnostics';
import { getFreshSocketToken, getSocketBaseUrl } from '../utils/socketAuth';
import type { RootState } from '../store';
import type { DMConversation, DirectMessage } from '@/types';

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

function sortConversationsByLastMessage(list: DMConversation[]): DMConversation[] {
  return [...list].sort((a, b) => {
    const aTime = a.lastMessage?.createdAt
      ? new Date(a.lastMessage.createdAt).getTime()
      : 0;
    const bTime = b.lastMessage?.createdAt
      ? new Date(b.lastMessage.createdAt).getTime()
      : 0;
    return bTime - aTime;
  });
}

function patchConversationList(
  list: DMConversation[],
  peerId: string,
  msg: DirectMessage,
  otherUser: DMConversation['otherUser'],
  allowNew: boolean,
): DMConversation[] {
  const idx = list.findIndex((c) => c.otherUser.id === peerId);
  if (idx >= 0) {
    const updated: DMConversation = {
      ...list[idx],
      lastMessage: msg,
      unreadCount: 0,
    };
    const rest = list.filter((_, i) => i !== idx);
    return sortConversationsByLastMessage([updated, ...rest]);
  }
  if (!allowNew) return list;
  const newRow: DMConversation = {
    otherUser,
    lastMessage: msg,
    unreadCount: 0,
    isFollowing: false,
    isFamiliar: false,
  };
  return sortConversationsByLastMessage([newRow, ...list]);
}

/** Optimistically update inbox preview when the current user sends a DM. */
export function applyOutboundDmToInboxCache(
  queryClient: QueryClient,
  msg: DirectMessage,
  currentUserId: string,
) {
  const peerId =
    msg.sender.id === currentUserId ? msg.recipient.id : msg.sender.id;
  const otherUser =
    msg.sender.id === currentUserId ? msg.recipient : msg.sender;

  queryClient.setQueryData<ChatInboxData>(queryKeys.chat.inbox(), (old) => {
    if (!old) return old;
    return {
      ...old,
      conversations: patchConversationList(
        old.conversations,
        peerId,
        msg,
        otherUser,
        true,
      ),
      friendConversations: patchConversationList(
        old.friendConversations,
        peerId,
        msg,
        otherUser,
        false,
      ),
    };
  });
}

export function onOutboundDmSent(
  queryClient: QueryClient,
  msg: DirectMessage,
  currentUserId: string,
) {
  applyOutboundDmToInboxCache(queryClient, msg, currentUserId);
  invalidateChatUnreadQueries(queryClient);
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
  const accessToken = useSelector((s: RootState) => s.auth.accessToken);
  const queryClient = useQueryClient();
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;

  const disconnect = useCallback(() => {
    if (socket.current) {
      socket.current.disconnect();
      socket.current = null;
    }
  }, []);

  const connect = useCallback(async () => {
    if (!enabled) return;
    const token = await getFreshSocketToken();
    if (!token) return;

    disconnect();

    const client = ioClient(getSocketBaseUrl(), {
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socket.current = client;

    let reauthAttempted = false;

    client.on('connect', () => {
      reauthAttempted = false;
    });

    client.on('new_dm', (data: Record<string, unknown>) => {
      setDmEvent({ event: 'new_dm', data });
      const msg = data as unknown as DirectMessage;
      if (msg.recipient?.id === currentUserIdRef.current) {
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
      logDiagnostic('socket', 'dm_connect_error', { message: err.message });
      console.warn('[DM Socket.io] connect error:', err.message);
      const isAuthError = /token|authentication/i.test(err.message);
      if (!isAuthError || reauthAttempted) return;
      reauthAttempted = true;
      void getFreshSocketToken(true).then((fresh) => {
        if (!fresh || socket.current !== client) return;
        client.auth = { token: fresh };
        if (!client.connected) client.connect();
      });
    });
  }, [enabled, disconnect, queryClient]);

  // Keep handshake auth in sync when REST/session refresh rotates the JWT.
  useEffect(() => {
    const client = socket.current;
    if (!client || !enabled || !accessToken) return;
    const current = (client.auth as { token?: string } | undefined)?.token;
    if (current === accessToken) return;
    client.auth = { token: accessToken };
    if (!client.connected) client.connect();
  }, [accessToken, enabled]);

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
