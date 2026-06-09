import crypto from 'crypto';
import { randomUUID } from 'crypto';
import Razorpay from 'razorpay';
import { prisma } from '../../../config/prisma';
import { env } from '../../../config/env';
import { AppError } from '../../../middleware/error.middleware';
import { creditCoinsInTransaction } from '../../wallet/wallet.service';

const COINS_PER_USD = 10_000;
const INR_RATE = 83.5;
const TX_TIMEOUT = 15_000;

function getRazorpay() {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new AppError('Razorpay is not configured', 503);
  }
  return new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });
}

export async function createOrder(userId: string, packageId: string) {
  const pkg = await prisma.coinPackage.findFirst({
    where: { id: packageId, isActive: true },
  });
  if (!pkg) throw new AppError('Coin package not found', 404);

  const totalCoins = pkg.coins + pkg.bonusCoins;
  const priceUsd = totalCoins / COINS_PER_USD;
  const priceInr = priceUsd * INR_RATE;
  const amountPaise = Math.max(100, Math.round(priceInr * 100));

  const razorpay = getRazorpay();
  const order = await razorpay.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt: randomUUID(),
  });

  const razorpayOrderId = order.id as string;

  await prisma.paymentTransaction.create({
    data: {
      userId,
      packageId,
      method: 'razorpay_upi',
      razorpayOrderId,
      amountGbp: pkg.priceGbp,
      status: 'pending',
    },
  });

  return {
    orderId: razorpayOrderId,
    amountPaise,
    keyId: env.RAZORPAY_KEY_ID,
    coins: pkg.coins,
    bonusCoins: pkg.bonusCoins,
  };
}

export async function handleWebhook(rawBody: Buffer, signature: string) {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new AppError('Webhook secret not configured', 503);

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  if (signature !== expected) {
    throw new AppError('Invalid webhook signature', 400);
  }

  const payload = JSON.parse(rawBody.toString('utf8'));
  if (payload.event !== 'payment.captured') return;

  const entity = payload.payload?.payment?.entity;
  if (!entity?.order_id) return;

  const razorpayOrderId: string = entity.order_id;
  const razorpayPaymentId: string = entity.id;

  const pt = await prisma.paymentTransaction.findUnique({
    where: { razorpayOrderId },
    include: { package: true },
  });
  if (!pt) throw new AppError('PaymentTransaction not found', 404);

  if (pt.coinsCredited) return;

  const totalCoins = (pt.package?.coins ?? 0) + (pt.package?.bonusCoins ?? 0);
  const packageName = pt.package
    ? `${totalCoins.toLocaleString()} Coins`
    : undefined;

  await creditCoinsInTransaction({
    userId: pt.userId,
    amount: totalCoins,
    reference: 'top_up',
    description: 'Coin top-up via Razorpay UPI',
    notifyOptions: packageName ? { notifyMeta: { packageName } } : undefined,
    timeout: TX_TIMEOUT,
    runInTransaction: async (tx) => {
      await tx.paymentTransaction.update({
        where: { id: pt.id },
        data: { status: 'succeeded', coinsCredited: true, razorpayPaymentId },
      });
    },
  });

  const { emitAdminDataChanged } = await import('../../../sockets/admin-realtime');
  emitAdminDataChanged('coin_purchases', { userId: pt.userId, paymentTransactionId: pt.id });
}
