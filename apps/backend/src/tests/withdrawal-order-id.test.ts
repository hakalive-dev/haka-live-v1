import { prisma } from '../config/prisma';
import {
  generateUniqueWithdrawalOrderId,
  isValidWithdrawalOrderId,
  randomWithdrawalOrderId,
  WITHDRAWAL_ORDER_ID_LENGTH,
} from '../utils/withdrawal-order-id';
import { resetDb, createTestUser } from './db-helpers';

beforeEach(resetDb);

it('randomWithdrawalOrderId returns 19 digits', () => {
  const id = randomWithdrawalOrderId();
  expect(id).toHaveLength(WITHDRAWAL_ORDER_ID_LENGTH);
  expect(isValidWithdrawalOrderId(id)).toBe(true);
  expect(id[0]).not.toBe('0');
});

it('generateUniqueWithdrawalOrderId returns unique values', async () => {
  const a = await generateUniqueWithdrawalOrderId();
  const b = await generateUniqueWithdrawalOrderId();
  expect(a).not.toBe(b);
  expect(isValidWithdrawalOrderId(a)).toBe(true);
  expect(isValidWithdrawalOrderId(b)).toBe(true);

  const user = await createTestUser();

  await prisma.withdrawalRequest.create({
    data: {
      orderId: a,
      userId: user.id,
      beansAmount: 1000,
      status: 'pending_review',
    },
  });

  const c = await generateUniqueWithdrawalOrderId();
  expect(c).not.toBe(a);
});
