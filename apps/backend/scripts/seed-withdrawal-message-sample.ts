/**
 * Seeds a demo withdrawal + Withdrawal Message DMs for a user by public Haka ID.
 *
 * Default target: 500000015 (Seed Host 1 / seed_uid_host_001).
 *
 * Run (local):
 *   cd apps/backend && npx ts-node scripts/seed-withdrawal-message-sample.ts
 *
 * Run (docker dev):
 *   docker compose -f docker-compose.dev.yml exec backend npx ts-node scripts/seed-withdrawal-message-sample.ts
 */

import '../src/config/env';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/config/prisma';
import { DEFAULT_WITHDRAWAL_MESSAGE_USER_ID } from '../src/constants/withdrawal-message';
import {
  notifyWithdrawalPendingConfirm,
  notifyWithdrawalSuccess,
} from '../src/modules/chat/withdrawal-message-notify.service';

const DEMO_WITHDRAWAL_ID = 'a3333333-3333-4333-8333-333333333331';
const DEMO_ORDER_ID = '1732739071241424899';
const TARGET_HAKA_ID = process.argv[2]?.trim() || '500000015';

const PAYOUT_SNAPSHOT = JSON.stringify({
  paymentMethodId: 'seed-pm-demo',
  methodType: 'upi',
  countryCode: 'IN',
  provider: 'upi',
  label: 'UPI',
  maskedAccount: '6287387784@ptsbi',
  accountLabel: 'Samir',
  accountHolderName: 'Samir',
});

async function main() {
  const user = await prisma.user.findUnique({
    where: { hakaId: TARGET_HAKA_ID },
    select: { id: true, displayName: true, hakaId: true },
  });
  if (!user) {
    throw new Error(`No user with hakaId ${TARGET_HAKA_ID}. Run prisma seed first.`);
  }

  const agent = await prisma.user.findFirst({
    where: { role: 'agent', isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true, displayName: true },
  });
  if (!agent) {
    throw new Error('No active agent user found. Run prisma seed first.');
  }

  await prisma.user.upsert({
    where: { firebaseUid: 'system_uid_withdrawal_message' },
    update: { displayName: 'Withdrawal Message', profileHidden: true, isActive: true },
    create: {
      id: DEFAULT_WITHDRAWAL_MESSAGE_USER_ID,
      firebaseUid: 'system_uid_withdrawal_message',
      displayName: 'Withdrawal Message',
      role: 'normal_user',
      onboardingComplete: true,
      isActive: true,
      profileHidden: true,
    },
  });

  const proofAt = new Date('2025-07-28T12:29:00Z');
  const verifiedAt = new Date('2025-07-28T14:30:00Z');
  const autoAt = new Date(proofAt.getTime() + 2 * 60 * 60 * 1000);

  await prisma.withdrawalRequest.upsert({
    where: { id: DEMO_WITHDRAWAL_ID },
    update: {
      userId: user.id,
      orderId: DEMO_ORDER_ID,
      beansAmount: BigInt(150_000),
      status: 'completed',
      countryCode: 'IN',
      currency: 'INR',
      localAmount: new Prisma.Decimal('1501.56'),
      assignedAgentId: agent.id,
      assignedAt: new Date('2025-07-28T10:50:00Z'),
      proofUrl: 'https://placehold.co/400x600/png?text=Payment+Proof',
      proofUploadedAt: proofAt,
      verifiedAt,
      processedAt: verifiedAt,
      payoutSnapshot: PAYOUT_SNAPSHOT,
      userConfirmedAt: verifiedAt,
      userConfirmAutoAt: autoAt,
    },
    create: {
      id: DEMO_WITHDRAWAL_ID,
      orderId: DEMO_ORDER_ID,
      userId: user.id,
      beansAmount: BigInt(150_000),
      status: 'proof_submitted',
      countryCode: 'IN',
      currency: 'INR',
      localAmount: new Prisma.Decimal('1501.56'),
      assignedAgentId: agent.id,
      assignedAt: new Date('2025-07-28T10:50:00Z'),
      proofUrl: 'https://placehold.co/400x600/png?text=Payment+Proof',
      proofUploadedAt: proofAt,
      payoutSnapshot: PAYOUT_SNAPSHOT,
      userConfirmAutoAt: autoAt,
      createdAt: new Date('2025-07-28T10:46:27Z'),
    },
  });

  // Remove prior demo DMs so re-runs do not duplicate cards.
  await prisma.directMessage.deleteMany({
    where: {
      senderId: DEFAULT_WITHDRAWAL_MESSAGE_USER_ID,
      recipientId: user.id,
      messageType: 'withdrawal_update',
    },
  });

  // Simulate payroll proof → pending confirm DM.
  await prisma.withdrawalRequest.update({
    where: { id: DEMO_WITHDRAWAL_ID },
    data: { status: 'proof_submitted', verifiedAt: null, processedAt: null, userConfirmedAt: null },
  });
  await notifyWithdrawalPendingConfirm(DEMO_WITHDRAWAL_ID);

  // Simulate admin verify → success DM.
  await prisma.withdrawalRequest.update({
    where: { id: DEMO_WITHDRAWAL_ID },
    data: {
      status: 'completed',
      verifiedAt,
      processedAt: verifiedAt,
      userConfirmedAt: verifiedAt,
    },
  });
  await notifyWithdrawalSuccess(DEMO_WITHDRAWAL_ID);

  console.log('✅ Withdrawal Message demo seeded');
  console.log(`   User: ${user.displayName} (hakaId ${user.hakaId})`);
  console.log(`   Withdrawal id: ${DEMO_WITHDRAWAL_ID}`);
  console.log(`   Order id: ${DEMO_ORDER_ID}`);
  console.log(`   Agent: ${agent.displayName}`);
  console.log('   Open Chat → Withdrawal Message to view the two cards.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
