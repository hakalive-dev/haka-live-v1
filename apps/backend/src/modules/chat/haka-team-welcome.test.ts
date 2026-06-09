jest.mock('../../constants/haka-team', () => ({
  getHakaTeamUserId: () => 'haka-team-uuid',
}));

jest.mock('./chat.service', () => ({
  insertServerDirectMessage: jest.fn().mockResolvedValue({ id: 'dm-1' }),
}));

import { insertServerDirectMessage } from './chat.service';
import { WELCOME_DM_MESSAGE, scheduleWelcomeDm, sendWelcomeDm } from './haka-team-welcome.service';

const mockInsertDm = insertServerDirectMessage as jest.Mock;

describe('sendWelcomeDm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends a plain-text welcome DM from Haka Team to the new user', async () => {
    await sendWelcomeDm('user-1');

    expect(mockInsertDm).toHaveBeenCalledTimes(1);
    expect(mockInsertDm).toHaveBeenCalledWith({
      senderId: 'haka-team-uuid',
      recipientId: 'user-1',
      content: WELCOME_DM_MESSAGE,
      messageType: 'text',
    });
  });

  it('no-ops when the recipient is the Haka Team account itself', async () => {
    await sendWelcomeDm('haka-team-uuid');
    expect(mockInsertDm).not.toHaveBeenCalled();
  });

  it('no-ops on empty userId', async () => {
    await sendWelcomeDm('');
    expect(mockInsertDm).not.toHaveBeenCalled();
  });
});

describe('scheduleWelcomeDm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('swallows DM failures so onboarding never fails', async () => {
    mockInsertDm.mockRejectedValueOnce(new Error('socket down'));
    expect(() => scheduleWelcomeDm('user-1')).not.toThrow();
    // Let the fire-and-forget promise settle.
    await new Promise((r) => setImmediate(r));
    expect(mockInsertDm).toHaveBeenCalled();
  });
});
