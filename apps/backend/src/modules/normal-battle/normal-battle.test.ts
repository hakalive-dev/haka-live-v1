jest.mock('../../config/prisma', () => ({
  prisma: {
    normalBattle: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../config/redis', () => ({
  redis: {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    incrby: jest.fn(),
    mget: jest.fn(),
  },
}));

import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import * as svc from './normal-battle.service';

const mockBattle = prisma.normalBattle as unknown as {
  create: jest.Mock;
  findFirst: jest.Mock;
  update: jest.Mock;
  findMany: jest.Mock;
};
const mockRedis = redis as unknown as {
  set: jest.Mock; get: jest.Mock; del: jest.Mock;
  incrby: jest.Mock; mget: jest.Mock;
};

const BATTLE_ID = 'battle-uuid-1';
const ROOM_ID   = 'room-uuid-1';
const HOST_ID   = 'host-uuid-1';
const PART_A    = 'user-a-uuid';
const PART_B    = 'user-b-uuid';

const baseBattle = {
  id: BATTLE_ID, roomId: ROOM_ID, hostId: HOST_ID,
  participantAId: PART_A, participantBId: PART_B,
  mode: 'coins', status: 'active', winnerId: null,
  scoreA: 0, scoreB: 0, durationSecs: 300,
  startedAt: new Date(), endedAt: null,
};

beforeEach(() => jest.clearAllMocks());

describe('startBattle', () => {
  it('creates a NormalBattle in DB and sets Redis timer', async () => {
    mockBattle.findFirst.mockResolvedValue(null);
    mockBattle.create.mockResolvedValue(baseBattle);

    const result = await svc.startBattle({
      roomId: ROOM_ID, hostId: HOST_ID,
      participantAId: PART_A, participantBId: PART_B,
      mode: 'coins', durationSecs: 300,
    });

    expect(mockBattle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          roomId: ROOM_ID, hostId: HOST_ID,
          participantAId: PART_A, participantBId: PART_B,
          mode: 'coins', durationSecs: 300,
        }),
      }),
    );
    expect(mockRedis.set).toHaveBeenCalledWith(
      `battle:${BATTLE_ID}:endsAt`,
      expect.any(String),
    );
    expect(result.id).toBe(BATTLE_ID);
  });

  it('throws if another battle is already active in the room', async () => {
    mockBattle.findFirst.mockResolvedValue(baseBattle);

    await expect(
      svc.startBattle({
        roomId: ROOM_ID, hostId: HOST_ID,
        participantAId: PART_A, participantBId: PART_B,
        mode: 'coins', durationSecs: 300,
      }),
    ).rejects.toThrow('already an active battle');
  });

  it('throws for invalid durationSecs', async () => {
    mockBattle.findFirst.mockResolvedValue(null);

    await expect(
      svc.startBattle({
        roomId: ROOM_ID, hostId: HOST_ID,
        participantAId: PART_A, participantBId: PART_B,
        mode: 'coins', durationSecs: 9999,
      }),
    ).rejects.toThrow('durationSecs');
  });
});

describe('getActiveBattle', () => {
  it('returns the active battle for a room', async () => {
    mockBattle.findFirst.mockResolvedValue(baseBattle);

    const result = await svc.getActiveBattle(ROOM_ID);
    expect(result?.id).toBe(BATTLE_ID);
    expect(mockBattle.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roomId: ROOM_ID, status: 'active' } }),
    );
  });

  it('returns null when no active battle', async () => {
    mockBattle.findFirst.mockResolvedValue(null);
    expect(await svc.getActiveBattle(ROOM_ID)).toBeNull();
  });
});

describe('addScore', () => {
  it('increments side A and returns both scores', async () => {
    mockRedis.incrby.mockResolvedValue(50);
    mockRedis.mget.mockResolvedValue(['50', '20']);

    const scores = await svc.addScore(BATTLE_ID, 'A', 50);
    expect(mockRedis.incrby).toHaveBeenCalledWith(`battle:${BATTLE_ID}:scoreA`, 50);
    expect(scores).toEqual({ scoreA: 50, scoreB: 20 });
  });

  it('increments side B and returns both scores', async () => {
    mockRedis.incrby.mockResolvedValue(30);
    mockRedis.mget.mockResolvedValue(['50', '30']);

    const scores = await svc.addScore(BATTLE_ID, 'B', 30);
    expect(mockRedis.incrby).toHaveBeenCalledWith(`battle:${BATTLE_ID}:scoreB`, 30);
    expect(scores).toEqual({ scoreA: 50, scoreB: 30 });
  });
});

describe('endBattle', () => {
  it('picks winner by score, updates DB, cleans Redis', async () => {
    mockRedis.mget.mockResolvedValue(['80', '40']);
    mockBattle.update.mockResolvedValue({ ...baseBattle, status: 'ended', winnerId: PART_A, scoreA: 80, scoreB: 40 });

    const result = await svc.endBattle(BATTLE_ID, PART_A, PART_B);
    expect(result.winnerId).toBe(PART_A);
    expect(result.scoreA).toBe(80);
    expect(result.scoreB).toBe(40);
    expect(mockRedis.del).toHaveBeenCalledWith(
      `battle:${BATTLE_ID}:scoreA`,
      `battle:${BATTLE_ID}:scoreB`,
      `battle:${BATTLE_ID}:endsAt`,
    );
  });

  it('sets winnerId to null on a tie', async () => {
    mockRedis.mget.mockResolvedValue(['50', '50']);
    mockBattle.update.mockResolvedValue({ ...baseBattle, status: 'ended', winnerId: null, scoreA: 50, scoreB: 50 });

    const result = await svc.endBattle(BATTLE_ID, PART_A, PART_B);
    expect(result.winnerId).toBeNull();
  });
});

describe('cancelBattle', () => {
  it('marks battle as cancelled and cleans Redis', async () => {
    mockBattle.update.mockResolvedValue({ ...baseBattle, status: 'cancelled' });

    await svc.cancelBattle(BATTLE_ID);
    expect(mockBattle.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: BATTLE_ID }, data: { status: 'cancelled', endedAt: expect.any(Date) } }),
    );
    expect(mockRedis.del).toHaveBeenCalledWith(
      `battle:${BATTLE_ID}:scoreA`,
      `battle:${BATTLE_ID}:scoreB`,
      `battle:${BATTLE_ID}:endsAt`,
    );
  });
});

describe('setBattleEndCallback', () => {
  it('callback is invoked when the battle timer fires', async () => {
    jest.useFakeTimers();

    const cb = jest.fn();
    svc.setBattleEndCallback(cb);

    mockBattle.findFirst.mockResolvedValue(null);
    mockBattle.create.mockResolvedValue(baseBattle);
    mockRedis.mget.mockResolvedValue(['0', '0']);
    mockBattle.update.mockResolvedValue({ ...baseBattle, status: 'ended', winnerId: null, scoreA: 0, scoreB: 0 });

    // Start a battle with 60-second duration
    await svc.startBattle({
      roomId: ROOM_ID, hostId: HOST_ID,
      participantAId: PART_A, participantBId: PART_B,
      mode: 'coins', durationSecs: 60,
    });

    // Advance fake timers past the 60-second mark
    await jest.runAllTimersAsync();

    expect(cb).toHaveBeenCalledWith(
      BATTLE_ID,
      expect.objectContaining({ battleId: BATTLE_ID }),
    );

    jest.useRealTimers();
  });
});

describe('recoverActiveBattles', () => {
  it('immediately ends a battle whose Redis endsAt key is missing', async () => {
    mockBattle.findMany.mockResolvedValue([baseBattle]);
    mockRedis.get.mockResolvedValue(null); // key missing
    mockRedis.mget.mockResolvedValue(['10', '5']);
    mockBattle.update.mockResolvedValue({ ...baseBattle, status: 'ended', winnerId: PART_A, scoreA: 10, scoreB: 5 });

    await svc.recoverActiveBattles();

    expect(mockBattle.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: BATTLE_ID }, data: expect.objectContaining({ status: 'ended' }) }),
    );
  });

  it('immediately ends a battle whose timer has already expired', async () => {
    const pastTimestamp = String(Date.now() - 10000); // 10 seconds ago
    mockBattle.findMany.mockResolvedValue([baseBattle]);
    mockRedis.get.mockResolvedValue(pastTimestamp);
    mockRedis.mget.mockResolvedValue(['20', '20']);
    mockBattle.update.mockResolvedValue({ ...baseBattle, status: 'ended', winnerId: null, scoreA: 20, scoreB: 20 });

    await svc.recoverActiveBattles();

    expect(mockBattle.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ended' }) }),
    );
  });

  it('re-schedules timer for a battle still active', async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    const futureTimestamp = String(Date.now() + 120000); // 2 minutes remaining
    mockBattle.findMany.mockResolvedValue([baseBattle]);
    mockRedis.get.mockResolvedValue(futureTimestamp);

    await svc.recoverActiveBattles();

    // DB update should NOT be called (battle is still running)
    expect(mockBattle.update).not.toHaveBeenCalled();
    // A new timer should have been scheduled
    expect(setTimeoutSpy).toHaveBeenCalled();

    setTimeoutSpy.mockRestore();
    jest.useRealTimers();
  });

  it('returns without error when no active battles', async () => {
    mockBattle.findMany.mockResolvedValue([]);

    await expect(svc.recoverActiveBattles()).resolves.toBeUndefined();
  });
});
