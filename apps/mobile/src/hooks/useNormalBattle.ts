import { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';

// Battle event strings — keep in sync with backend BATTLE_EVENTS
const BATTLE_EVENTS = {
  STARTED:       'battle:started',
  SCORE_UPDATED: 'battle:score.updated',
  ENDED:         'battle:ended',
  CANCELLED:     'battle:cancelled',
  VOTE:          'battle:vote',
  CANCEL:        'battle:cancel',
} as const;

export interface BattleState {
  battleId: string;
  participantAId: string;
  participantBId: string;
  mode: 'coins' | 'votes';
  scoreA: number;
  scoreB: number;
  durationSecs: number;
  endsAt: string;
}

export interface BattleResult {
  battleId: string;
  winnerId: string | null;
  scoreA: number;
  scoreB: number;
}

interface Options {
  ws: Socket | null;
}

export function useNormalBattle({ ws }: Options) {
  const [activeBattle, setActiveBattle] = useState<BattleState | null>(null);
  const [result, setResult] = useState<BattleResult | null>(null);

  useEffect(() => {
    if (!ws) return;

    const onStarted = (data: BattleState) => {
      setActiveBattle(data);
      setResult(null);
    };
    const onScoreUpdated = (data: { battleId: string; scoreA: number; scoreB: number }) => {
      setActiveBattle((prev) =>
        prev?.battleId === data.battleId
          ? { ...prev, scoreA: data.scoreA, scoreB: data.scoreB }
          : prev,
      );
    };
    const onEnded = (data: BattleResult) => {
      setResult(data);
      setActiveBattle(null);
    };
    const onCancelled = () => {
      setActiveBattle(null);
      setResult(null);
    };

    ws.on(BATTLE_EVENTS.STARTED, onStarted);
    ws.on(BATTLE_EVENTS.SCORE_UPDATED, onScoreUpdated);
    ws.on(BATTLE_EVENTS.ENDED, onEnded);
    ws.on(BATTLE_EVENTS.CANCELLED, onCancelled);

    return () => {
      ws.off(BATTLE_EVENTS.STARTED, onStarted);
      ws.off(BATTLE_EVENTS.SCORE_UPDATED, onScoreUpdated);
      ws.off(BATTLE_EVENTS.ENDED, onEnded);
      ws.off(BATTLE_EVENTS.CANCELLED, onCancelled);
    };
  }, [ws]);

  const vote = useCallback(
    (battleId: string, voteFor: 'A' | 'B') => {
      if (!ws) return;
      ws.emit(BATTLE_EVENTS.VOTE, { battleId, voteFor });
    },
    [ws],
  );

  const cancelBattle = useCallback(
    (roomId: string) => {
      if (!ws) return;
      ws.emit(BATTLE_EVENTS.CANCEL, { roomId });
    },
    [ws],
  );

  const dismissResult = useCallback(() => setResult(null), []);

  return { activeBattle, result, vote, cancelBattle, dismissResult };
}
