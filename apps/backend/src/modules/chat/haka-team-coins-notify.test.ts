jest.mock('../../constants/haka-team', () => ({
  getHakaTeamUserId: () => 'haka-team-uuid',
}));

const mockSocketEmit = jest.fn();

jest.mock('../../sockets', () => ({
  getIO: jest.fn(() => ({
    to: jest.fn(() => ({ emit: mockSocketEmit })),
  })),
}));

jest.mock('./chat.service', () => ({
  insertServerDirectMessage: jest.fn().mockResolvedValue({ id: 'dm-1' }),
}));

jest.mock('../notifications/notifications.service', () => ({
  notifyAccountAlert: jest.fn().mockResolvedValue({ id: 'notif-1' }),
}));

import { getIO } from '../../sockets';
import { insertServerDirectMessage } from './chat.service';
import { notifyAccountAlert } from '../notifications/notifications.service';
import {
  buildCoinTransferPayload,
  notifyWalletCoinsReceived,
  resolveCoinCreditSource,
  scheduleWalletCoinsNotify,
} from './haka-team-coins-notify.service';

const mockInsertDm = insertServerDirectMessage as jest.Mock;
const mockNotifyAlert = notifyAccountAlert as jest.Mock;

describe('resolveCoinCreditSource', () => {
  it('maps wallet references to sources', () => {
    expect(resolveCoinCreditSource('top_up')).toBe('official_recharge');
    expect(resolveCoinCreditSource('invite_reward')).toBe('invite_reward');
    expect(resolveCoinCreditSource('agent_sale')).toBe('agent_sale');
    expect(resolveCoinCreditSource('master_wallet_credit')).toBe('admin_credit');
    expect(resolveCoinCreditSource('event_reward')).toBe('event_reward');
    expect(resolveCoinCreditSource('free_topup_user-1')).toBe('welcome_gift');
    expect(resolveCoinCreditSource('reversal_tx-1')).toBe('reversal');
    expect(resolveCoinCreditSource('coin_seller_transfer')).toBe('offline_recharge');
    expect(resolveCoinCreditSource('bean_exchange')).toBe('bean_exchange');
  });
});

describe('buildCoinTransferPayload', () => {
  it('builds official recharge copy with package name', () => {
    const { content, pushPreview, source } = buildCoinTransferPayload({
      coinsAmount: 5000,
      newBalance: 15000,
      reference: 'top_up',
      notifyMeta: { packageName: 'Mega Pack' },
    });
    expect(source).toBe('official_recharge');
    const parsed = JSON.parse(content);
    expect(parsed.kind).toBe('coin_transfer');
    expect(parsed.source).toBe('official_recharge');
    expect(parsed.dmLine).toContain('5,000');
    expect(parsed.dmLine).toContain('Mega Pack');
    expect(pushPreview).toContain('official recharge');
  });

  it('builds offline seller copy for normal user transfer', () => {
    const { content, pushPreview, source } = buildCoinTransferPayload({
      coinsAmount: 1000,
      newBalance: 2000,
      reference: 'coin_seller_transfer',
      notifyMeta: {
        sellerName: 'Seller One',
        sellerHakaId: 'HK123',
        targetType: 'user',
      },
    });
    expect(source).toBe('offline_recharge');
    const parsed = JSON.parse(content);
    expect(parsed.dmLine).toContain('Offline Recharge');
    expect(parsed.dmLine).toContain('Seller One(ID:HK123)');
    expect(parsed.dmLine).toContain('Have a wonderful day ahead!');
    expect(parsed.dmLine).not.toContain('New balance');
    expect(pushPreview).toBe(parsed.dmLine.split('\n')[0]);
  });

  it('builds offline wallet copy for seller-to-seller transfer', () => {
    const { content, pushPreview, source } = buildCoinTransferPayload({
      coinsAmount: 999999,
      newBalance: 0,
      reference: 'coin_seller_transfer',
      notifyMeta: {
        sellerName: 'Seller One',
        sellerHakaId: 'HK123',
        targetType: 'coin_seller',
      },
    });
    expect(source).toBe('offline_recharge');
    const parsed = JSON.parse(content);
    expect(parsed.dmLine).toBe(
      'Seller 999,999 coins have been added to your offline wallet.\n\nHave a wonderful day ahead!\nRegards',
    );
    expect(parsed.dmLine).not.toContain('New balance');
    expect(pushPreview).toBe(
      'Seller 999,999 coins have been added to your offline wallet.',
    );
  });
});

describe('notifyWalletCoinsReceived', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends Haka Team DM and account alert', async () => {
    await notifyWalletCoinsReceived({
      userId: 'user-1',
      coinsAmount: 100,
      newBalance: 500,
      reference: 'invite_reward',
      description: 'Invite reward',
    });

    expect(mockInsertDm).toHaveBeenCalledWith(
      expect.objectContaining({
        senderId: 'haka-team-uuid',
        recipientId: 'user-1',
        messageType: 'coin_transfer',
      }),
    );
    expect(mockNotifyAlert).toHaveBeenCalledWith(
      'user-1',
      'coin_transfer',
      'Coins received',
      expect.stringContaining('Invite reward'),
      expect.objectContaining({
        open: 'haka_team_dm',
        source: 'invite_reward',
      }),
    );
    expect(getIO).toHaveBeenCalled();
  });

  it('emits wallet:coins_received with reference and source', async () => {
    await notifyWalletCoinsReceived({
      userId: 'user-1',
      coinsAmount: 100,
      newBalance: 500,
      reference: 'coin_seller_transfer',
      notifyMeta: {
        sellerName: 'Seller One',
        sellerHakaId: 'HK123',
        targetType: 'user',
      },
    });

    expect(mockSocketEmit).toHaveBeenCalledWith('wallet:coins_received', {
      coinsAmount: 100,
      newBalance: 500,
      reference: 'coin_seller_transfer',
      source: 'offline_recharge',
    });
  });

  it('skips zero amounts in scheduleWalletCoinsNotify', () => {
    scheduleWalletCoinsNotify({
      userId: 'user-1',
      coinsAmount: 0,
      newBalance: 0,
      reference: 'top_up',
    });
    expect(mockInsertDm).not.toHaveBeenCalled();
  });
});
