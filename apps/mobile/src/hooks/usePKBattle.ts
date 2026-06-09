import { useCallback, useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';

const PK_EVENTS = {
  INVITED:       'pk:invited',
  STARTED:       'pk:started',
  SCORE_UPDATED: 'pk:score.updated',
  ENDED:         'pk:ended',
  CANCELLED:     'pk:cancelled',
  FORFEIT:       'pk:forfeit',
} as const;

export interface PkMatchState {
  matchId: string;
  hostAId: string;
  hostBId: string;
  roomAId: string;
  roomBId: string;
  scoreA: number;
  scoreB: number;
  durationSecs: number;
  endsAt: string;
}

export interface PkResultState {
  matchId: string;
  winnerId: string;
  scoreA: number;
  scoreB: number;
}

export interface PkInviteState {
  inviteId: string;
  fromRoomId: string;
  fromHostId: string;
  durationSecs: number;
  expiresAt: string;
}

interface Options {
  ws: Socket | null;
  myUserId: string;
}

export function usePKBattle({ ws, myUserId }: Options) {
  const [activeMatch, setActiveMatch]     = useState<PkMatchState | null>(null);
  const [result, setResult]               = useState<PkResultState | null>(null);
  const [pendingInvite, setPendingInvite] = useState<PkInviteState | null>(null);
  const myUserIdRef = useRef(myUserId);
  myUserIdRef.current = myUserId;

  useEffect(() => {
    if (!ws) return;

    const onInvited = (data: PkInviteState) => setPendingInvite(data);

    const onStarted = (data: PkMatchState) => {
      setActiveMatch(data);
      setResult(null);
    };

    const onScoreUpdated = (data: { matchId: string; scoreA: number; scoreB: number }) => {
      setActiveMatch((prev) =>
        prev?.matchId === data.matchId ? { ...prev, scoreA: data.scoreA, scoreB: data.scoreB } : prev,
      );
    };

    const onEnded = (data: PkResultState) => {
      setResult(data);
      setActiveMatch(null);
    };

    ws.on(PK_EVENTS.INVITED, onInvited);
    ws.on(PK_EVENTS.STARTED, onStarted);
    ws.on(PK_EVENTS.SCORE_UPDATED, onScoreUpdated);
    ws.on(PK_EVENTS.ENDED, onEnded);

    return () => {
      ws.off(PK_EVENTS.INVITED, onInvited);
      ws.off(PK_EVENTS.STARTED, onStarted);
      ws.off(PK_EVENTS.SCORE_UPDATED, onScoreUpdated);
      ws.off(PK_EVENTS.ENDED, onEnded);
    };
  }, [ws]);

  const forfeit = useCallback(() => {
    if (!ws || !activeMatch) return;
    ws.emit(PK_EVENTS.FORFEIT, { matchId: activeMatch.matchId });
  }, [ws, activeMatch]);

  const dismissResult = useCallback(() => setResult(null), []);
  const dismissInvite = useCallback(() => setPendingInvite(null), []);

  return { activeMatch, result, pendingInvite, forfeit, dismissResult, dismissInvite };
}
