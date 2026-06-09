/**
 * 1:1 video call — invite guards, decline/end signaling
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
  createNotification: jest.fn(),
  sendPushOnly: jest.fn(),
  userWantsMessagePush: jest.fn().mockResolvedValue(true),
}));

jest.mock('./haka-team-guard', () => ({
  assertCannotReplyToSystemDm: jest.fn(),
}));

import { prisma } from '../../config/prisma';
import { userAcceptsCalls, sendIncomingCallPush } from '../notifications/notifications.service';
import {
  signalOutgoingVideoCall,
  signalCallDeclined,
  signalCallEnded,
} from './chat.push';
import { CALL_EVENTS } from '../../shared-types';
import { deriveCallChannelName } from './call-channel';

const CALLER = '11111111-1111-4111-8111-111111111111';
const CALLEE = '22222222-2222-4222-8222-222222222222';

const mockUser = prisma.user as unknown as { findUnique: jest.Mock };
const mockSettings = prisma.userSettings as unknown as { findUnique: jest.Mock };
const mockBlocked = prisma.blockedUser as unknown as { findFirst: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  mockUser.findUnique.mockResolvedValue({ displayName: 'Alice' });
  mockBlocked.findFirst.mockResolvedValue(null);
  (userAcceptsCalls as jest.Mock).mockResolvedValue(true);
});

describe('signalOutgoingVideoCall', () => {
  it('emits call:incoming with hashed channel under 64 bytes', async () => {
    await signalOutgoingVideoCall(CALLER, CALLEE);

    const channel = deriveCallChannelName(CALLER, CALLEE);
    expect(Buffer.byteLength(channel, 'utf8')).toBeLessThan(64);

    expect(mockTo).toHaveBeenCalledWith(`user:${CALLEE}`);
    expect(mockEmit).toHaveBeenCalledWith(
      CALL_EVENTS.INCOMING,
      expect.objectContaining({
        callerId: CALLER,
        channelId: channel,
      }),
    );
    expect(sendIncomingCallPush).toHaveBeenCalled();
  });

  it('rejects when callee disabled video calls', async () => {
    (userAcceptsCalls as jest.Mock).mockResolvedValue(false);

    await expect(signalOutgoingVideoCall(CALLER, CALLEE)).rejects.toMatchObject({
      message: 'This user has disabled video calls',
      statusCode: 403,
    });
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

describe('call lifecycle signaling', () => {
  it('signalCallDeclined notifies caller', async () => {
    await signalCallDeclined(CALLEE, CALLER);

    expect(mockTo).toHaveBeenCalledWith(`user:${CALLER}`);
    expect(mockEmit).toHaveBeenCalledWith(CALL_EVENTS.DECLINED, { peerId: CALLEE });
  });

  it('signalCallEnded notifies the other party', async () => {
    await signalCallEnded(CALLER, CALLEE);

    expect(mockTo).toHaveBeenCalledWith(`user:${CALLEE}`);
    expect(mockEmit).toHaveBeenCalledWith(CALL_EVENTS.ENDED, { peerId: CALLER });
  });
});
