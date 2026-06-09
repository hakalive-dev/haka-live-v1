jest.mock('./chat.service', () => ({
  insertServerDirectMessage: jest.fn().mockResolvedValue({}),
}));

jest.mock('../notifications/notifications.service', () => ({
  notifyAccountAlert: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../config/prisma', () => ({
  prisma: {
    withdrawalRequest: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '../../config/prisma';
import { insertServerDirectMessage } from './chat.service';
import { notifyAccountAlert } from '../notifications/notifications.service';
import {
  notifyWithdrawalPendingConfirm,
  notifyWithdrawalSuccess,
} from './withdrawal-message-notify.service';

const mockWithdrawal = {
  id: 'wr-1',
  orderId: '1234567890123456789',
  userId: 'user-1',
  beansAmount: BigInt(100000),
  status: 'proof_submitted',
  notes: '',
  processedAt: null,
  assignedAgentId: 'agent-1',
  assignedAt: new Date(),
  assignedByAdminId: null,
  proofUrl: 'https://example.com/proof.jpg',
  proofUploadedAt: new Date('2025-07-28T12:29:00Z'),
  agentProofNotes: '',
  verifiedByAdminId: null,
  verifiedAt: null,
  adminRejectionNotes: '',
  countryCode: 'IN',
  currency: 'INR',
  localAmount: { toNumber: () => 1501.56 },
  usdRateAtRequest: null,
  paymentMethodId: null,
  payoutSnapshot: JSON.stringify({
    paymentMethodId: 'pm-1',
    methodType: 'upi',
    countryCode: 'IN',
    provider: 'upi',
    label: 'UPI',
    maskedAccount: '6287387784@ptsbi',
    accountLabel: 'Samir',
    accountHolderName: 'Samir',
  }),
  externalTransactionId: '',
  proofContentHash: '',
  escalatedAt: null,
  frozenByAdminId: null,
  acceptedAt: null,
  ipAddress: '',
  ipRiskFlagged: false,
  disputedAt: null,
  disputedByUserId: null,
  disputeReason: '',
  userConfirmedAt: null,
  userConfirmAutoAt: null,
  createdAt: new Date('2025-07-28T10:46:27Z'),
  updatedAt: new Date(),
  assignedAgent: { displayName: 'Coinseller' },
};

describe('withdrawal-message-notify', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('notifyWithdrawalPendingConfirm sends DM with pending_confirm payload', async () => {
    (prisma.withdrawalRequest.findUnique as jest.Mock).mockResolvedValue(mockWithdrawal);
    (prisma.withdrawalRequest.update as jest.Mock).mockResolvedValue(mockWithdrawal);

    await notifyWithdrawalPendingConfirm('wr-1');

    expect(insertServerDirectMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'user-1',
        messageType: 'withdrawal_update',
      }),
    );
    const content = JSON.parse(
      (insertServerDirectMessage as jest.Mock).mock.calls[0][0].content,
    );
    expect(content.kind).toBe('withdrawal_update');
    expect(content.phase).toBe('pending_confirm');
    expect(content.footerAction).toBe('to_confirm');
    expect(content.statusLabel).toBe('To be confirmed');
    expect(notifyAccountAlert).toHaveBeenCalledWith(
      'user-1',
      'withdrawal_update',
      expect.any(String),
      'To be confirmed',
      expect.objectContaining({ open: 'withdrawal_message_dm', withdrawalId: 'wr-1' }),
    );
  });

  it('notifyWithdrawalSuccess sends success payload', async () => {
    (prisma.withdrawalRequest.findUnique as jest.Mock).mockResolvedValue({
      ...mockWithdrawal,
      status: 'completed',
      verifiedAt: new Date('2025-07-28T14:30:00Z'),
    });

    await notifyWithdrawalSuccess('wr-1');

    const content = JSON.parse(
      (insertServerDirectMessage as jest.Mock).mock.calls[0][0].content,
    );
    expect(content.phase).toBe('success');
    expect(content.footerAction).toBe('check_details');
    expect(content.statusLabel).toBe('Success');
  });
});
