/**
 * 1:1 video call state machine — invite guards, busy, lifecycle transitions,
 * ring timeout, call_log DMs
 */

jest.mock('../../config/firebase', () => ({
  firebaseAdmin: { auth: () => ({ verifyIdToken: jest.fn() }) },
}));

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));

jest.mock('../../sockets', () => ({
  getIO: jest.fn(() => ({ to: mockTo })),
}));

jest.mock('../../config/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    blockedUser: { findFirst: jest.fn().mockResolvedValue(null) },
    userSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    call: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock('../rooms/agora.service', () => ({
  generateRtcToken: jest.fn(() => ({
    token: 'tok',
    channel: 'call_abc',
    uid: 42,
    appId: 'app',
    expiresAt: 9999999999,
  })),
  getOrAssignUid: jest.fn().mockResolvedValue(42),
}));

jest.mock('../notifications/notifications.service', () => ({
  userAcceptsCalls: jest.fn().mockResolvedValue(true),
  sendIncomingCallPush: jest.fn().mockResolvedValue(undefined),
  sendCallSignalPush: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./haka-team-guard', () => ({
  assertCannotReplyToSystemDm: jest.fn(),
}));

jest.mock('./chat.service', () => ({
  insertServerDirectMessage: jest.fn().mockResolvedValue({}),
}));

import { prisma } from '../../config/prisma';
import {
  userAcceptsCalls,
  sendIncomingCallPush,
  sendCallSignalPush,
} from '../notifications/notifications.service';
import { insertServerDirectMessage } from './chat.service';
import {
  startCall,
  answerCall,
  declineCall,
  cancelCall,
  endCall,
  RING_TIMEOUT_MS,
} from './call.service';
import { CALL_EVENTS } from '../../shared-types';
import { deriveCallChannelName } from './call-channel';

const CALLER = '11111111-1111-4111-8111-111111111111';
const CALLEE = '22222222-2222-4222-8222-222222222222';
const CALL_ID = '33333333-3333-4333-8333-333333333333';

const mockUser = prisma.user as unknown as { findUnique: jest.Mock };
const mockBlocked = prisma.blockedUser as unknown as { findFirst: jest.Mock };
const mockCall = prisma.call as unknown as {
  create: jest.Mock;
  findFirst: jest.Mock;
  findUnique: jest.Mock;
  findMany: jest.Mock;
  updateMany: jest.Mock;
};

function ringingCall(overrides: Record<string, unknown> = {}) {
  return {
    id: CALL_ID,
    callerId: CALLER,
    calleeId: CALLEE,
    channelId: deriveCallChannelName(CALLER, CALLEE),
    status: 'ringing',
    startedAt: new Date(),
    answeredAt: null,
    endedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUser.findUnique.mockResolvedValue({ id: CALLEE, displayName: 'Alice' });
  mockBlocked.findFirst.mockResolvedValue(null);
  (userAcceptsCalls as jest.Mock).mockResolvedValue(true);
  mockCall.findFirst.mockResolvedValue(null);
  mockCall.create.mockResolvedValue(ringingCall());
  mockCall.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('startCall', () => {
  it('creates a ringing call and emits call:incoming with callId + hashed channel', async () => {
    const result = await startCall(CALLER, CALLEE);

    const channel = deriveCallChannelName(CALLER, CALLEE);
    expect(Buffer.byteLength(channel, 'utf8')).toBeLessThan(64);
    expect(result).toEqual({ callId: CALL_ID, status: 'ringing' });

    expect(mockCall.create).toHaveBeenCalledWith({
      data: { callerId: CALLER, calleeId: CALLEE, channelId: channel, status: 'ringing' },
    });
    expect(mockTo).toHaveBeenCalledWith(`user:${CALLEE}`);
    expect(mockEmit).toHaveBeenCalledWith(
      CALL_EVENTS.INCOMING,
      expect.objectContaining({ callId: CALL_ID, callerId: CALLER, channelId: channel }),
    );
    expect(sendIncomingCallPush).toHaveBeenCalledWith(
      CALLEE,
      'Incoming video call',
      expect.any(String),
      expect.objectContaining({ type: 'video_call', callId: CALL_ID }),
    );
  });

  it('rejects when callee disabled video calls', async () => {
    (userAcceptsCalls as jest.Mock).mockResolvedValue(false);

    await expect(startCall(CALLER, CALLEE)).rejects.toMatchObject({
      message: 'This user has disabled video calls',
      statusCode: 403,
    });
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('returns busy (no ring) and logs a missed call when callee is already on a call', async () => {
    mockCall.findFirst
      .mockResolvedValueOnce(null) // caller is free
      .mockResolvedValueOnce(ringingCall({ status: 'answered', answeredAt: new Date() }));
    mockCall.create.mockResolvedValue(ringingCall({ status: 'busy' }));

    const result = await startCall(CALLER, CALLEE);

    expect(result.status).toBe('busy');
    expect(mockEmit).not.toHaveBeenCalled();
    expect(sendIncomingCallPush).not.toHaveBeenCalled();
    expect(insertServerDirectMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageType: 'call_log',
        content: expect.stringContaining('"outcome":"missed"'),
      }),
    );
  });

  it('rejects with 409 when the caller is already in a call', async () => {
    mockCall.findFirst.mockResolvedValueOnce(
      ringingCall({ calleeId: '99999999-9999-4999-8999-999999999999' }),
    );

    await expect(startCall(CALLER, CALLEE)).rejects.toMatchObject({ statusCode: 409 });
    expect(mockCall.create).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('marks the call missed and signals both sides when nobody answers in time', async () => {
    jest.useFakeTimers();
    mockCall.findUnique.mockResolvedValue(ringingCall({ status: 'missed' }));

    await startCall(CALLER, CALLEE);
    mockEmit.mockClear();

    await jest.advanceTimersByTimeAsync(RING_TIMEOUT_MS + 1000);

    expect(mockCall.updateMany).toHaveBeenCalledWith({
      where: { id: CALL_ID, status: 'ringing' },
      data: expect.objectContaining({ status: 'missed' }),
    });
    expect(mockEmit).toHaveBeenCalledWith(CALL_EVENTS.MISSED, { peerId: CALLER, callId: CALL_ID });
    expect(mockEmit).toHaveBeenCalledWith(CALL_EVENTS.MISSED, { peerId: CALLEE, callId: CALL_ID });
    expect(insertServerDirectMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageType: 'call_log',
        isRead: false,
        content: expect.stringContaining('"outcome":"missed"'),
      }),
    );
    expect(sendCallSignalPush).toHaveBeenCalledWith(
      CALLEE,
      expect.objectContaining({ signal: 'missed', callId: CALL_ID }),
      expect.objectContaining({ title: 'Missed video call' }),
    );
  });
});

describe('answerCall', () => {
  it('transitions ringing → answered', async () => {
    mockCall.findFirst.mockResolvedValue(ringingCall());

    const result = await answerCall(CALLEE, CALLER);

    expect(result).toEqual({ callId: CALL_ID });
    expect(mockCall.updateMany).toHaveBeenCalledWith({
      where: { id: CALL_ID, status: 'ringing' },
      data: expect.objectContaining({ status: 'answered' }),
    });
  });

  it('throws 410 when the call already settled', async () => {
    mockCall.findFirst.mockResolvedValue(null);

    await expect(answerCall(CALLEE, CALLER)).rejects.toMatchObject({ statusCode: 410 });
  });
});

describe('declineCall', () => {
  it('settles the call, logs it, and notifies the caller over socket + data push', async () => {
    mockCall.findFirst.mockResolvedValue(ringingCall());

    await declineCall(CALLEE, CALLER);

    expect(mockCall.updateMany).toHaveBeenCalledWith({
      where: { id: CALL_ID, status: 'ringing' },
      data: expect.objectContaining({ status: 'declined' }),
    });
    expect(insertServerDirectMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageType: 'call_log',
        isRead: true,
        content: expect.stringContaining('"outcome":"declined"'),
      }),
    );
    expect(mockTo).toHaveBeenCalledWith(`user:${CALLER}`);
    expect(mockEmit).toHaveBeenCalledWith(CALL_EVENTS.DECLINED, { peerId: CALLEE, callId: CALL_ID });
    expect(sendCallSignalPush).toHaveBeenCalledWith(
      CALLER,
      expect.objectContaining({ signal: 'declined' }),
    );
  });
});

describe('cancelCall', () => {
  it('logs a missed call for the callee and dismisses their ringing UI', async () => {
    mockCall.findFirst.mockResolvedValue(ringingCall());

    await cancelCall(CALLER, CALLEE);

    expect(mockCall.updateMany).toHaveBeenCalledWith({
      where: { id: CALL_ID, status: 'ringing' },
      data: expect.objectContaining({ status: 'cancelled' }),
    });
    expect(insertServerDirectMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageType: 'call_log',
        isRead: false,
        content: expect.stringContaining('"outcome":"missed"'),
      }),
    );
    expect(mockTo).toHaveBeenCalledWith(`user:${CALLEE}`);
    expect(mockEmit).toHaveBeenCalledWith(CALL_EVENTS.CANCELLED, { peerId: CALLER, callId: CALL_ID });
    expect(sendCallSignalPush).toHaveBeenCalledWith(
      CALLEE,
      expect.objectContaining({ signal: 'cancelled' }),
      expect.objectContaining({ title: 'Missed video call' }),
    );
  });
});

describe('endCall', () => {
  it('logs the duration and notifies the other party', async () => {
    const answeredAt = new Date(Date.now() - 95_000);
    mockCall.findFirst.mockResolvedValue(ringingCall({ status: 'answered', answeredAt }));

    await endCall(CALLER, CALLEE);

    expect(mockCall.updateMany).toHaveBeenCalledWith({
      where: { id: CALL_ID, status: 'answered' },
      data: expect.objectContaining({ status: 'ended' }),
    });
    const logCall = (insertServerDirectMessage as jest.Mock).mock.calls.at(-1)?.[0];
    expect(logCall.messageType).toBe('call_log');
    expect(logCall.isRead).toBe(true);
    const parsed = JSON.parse(logCall.content);
    expect(parsed.outcome).toBe('ended');
    expect(parsed.durationSeconds).toBeGreaterThanOrEqual(94);
    expect(parsed.durationSeconds).toBeLessThanOrEqual(96);

    expect(mockTo).toHaveBeenCalledWith(`user:${CALLEE}`);
    expect(mockEmit).toHaveBeenCalledWith(CALL_EVENTS.ENDED, { peerId: CALLER, callId: CALL_ID });
  });

  it('still emits ended when no answered call row exists (legacy clients)', async () => {
    mockCall.findFirst.mockResolvedValue(null);

    await endCall(CALLER, CALLEE);

    expect(insertServerDirectMessage).not.toHaveBeenCalled();
    expect(mockEmit).toHaveBeenCalledWith(CALL_EVENTS.ENDED, { peerId: CALLER, callId: undefined });
  });
});
