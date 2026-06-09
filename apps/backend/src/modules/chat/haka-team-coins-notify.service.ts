import { getHakaTeamUserId } from '../../constants/haka-team';
import { getIO } from '../../sockets';
import { notifyAccountAlert } from '../notifications/notifications.service';
import { insertServerDirectMessage } from './chat.service';

export type CoinCreditSource =
  | 'official_recharge'
  | 'welcome_gift'
  | 'invite_reward'
  | 'agent_sale'
  | 'admin_credit'
  | 'reversal'
  | 'event_reward'
  | 'bean_exchange'
  | 'offline_recharge'
  | 'other';

export type WalletCoinsNotifyMeta = {
  packageName?: string;
  eventName?: string;
  sellerName?: string | null;
  sellerHakaId?: string | null;
  targetType?: string;
  transactionId?: string;
};

export type WalletCoinsNotifyOptions = {
  skipHakaTeamNotify?: boolean;
  notifyMeta?: WalletCoinsNotifyMeta;
};

function formatCoins(n: number): string {
  return n.toLocaleString();
}

/** Map wallet transaction reference to structured DM source. */
export function resolveCoinCreditSource(
  reference: string,
  notifyMeta?: WalletCoinsNotifyMeta,
): CoinCreditSource {
  if (reference === 'coin_seller_transfer') return 'offline_recharge';
  if (reference === 'invite_reward') return 'invite_reward';
  if (reference === 'agent_sale') return 'agent_sale';
  if (reference === 'master_wallet_credit') return 'admin_credit';
  if (reference === 'event_reward') return 'event_reward';
  if (reference === 'bean_exchange') return 'bean_exchange';
  if (reference.startsWith('free_topup_')) return 'welcome_gift';
  if (reference.startsWith('reversal_')) return 'reversal';
  if (reference === 'top_up') return 'official_recharge';
  if (notifyMeta?.sellerName) return 'offline_recharge';
  return 'other';
}

export function buildCoinTransferPayload(opts: {
  coinsAmount: number;
  newBalance: number;
  reference: string;
  description?: string;
  notifyMeta?: WalletCoinsNotifyMeta;
}): { content: string; pushPreview: string; source: CoinCreditSource } {
  const { coinsAmount, newBalance, reference, description, notifyMeta } = opts;
  const source = resolveCoinCreditSource(reference, notifyMeta);
  const n = formatCoins(coinsAmount);

  const payload: Record<string, unknown> = {
    kind: 'coin_transfer',
    source,
    coinsAmount,
    newBalance,
    reference,
  };

  if (notifyMeta?.packageName) payload.packageName = notifyMeta.packageName;
  if (notifyMeta?.eventName) payload.eventName = notifyMeta.eventName;
  if (notifyMeta?.transactionId) payload.transactionId = notifyMeta.transactionId;
  if (notifyMeta?.targetType) payload.targetType = notifyMeta.targetType;
  if (notifyMeta?.sellerName != null) payload.sellerName = notifyMeta.sellerName;
  if (notifyMeta?.sellerHakaId != null) payload.sellerHakaId = notifyMeta.sellerHakaId;

  let dmLine: string;
  switch (source) {
    case 'official_recharge':
      dmLine = notifyMeta?.packageName
        ? `${n} coins added from official recharge (${notifyMeta.packageName}).`
        : `${n} coins added from official recharge.`;
      break;
    case 'welcome_gift':
      dmLine = `Welcome gift: ${n} coins added to your wallet.`;
      break;
    case 'invite_reward':
      dmLine = `Invite reward: ${n} coins added to your wallet.`;
      break;
    case 'agent_sale':
      dmLine = `${n} coins from your agent purchase.`;
      break;
    case 'admin_credit':
      dmLine = `${n} coins credited to your account.`;
      break;
    case 'reversal':
      dmLine = `${n} coins were restored to your wallet.`;
      break;
    case 'event_reward':
      dmLine = notifyMeta?.eventName
        ? `Event reward (${notifyMeta.eventName}): ${n} coins added.`
        : `Event reward: ${n} coins added to your wallet.`;
      break;
    case 'bean_exchange':
      dmLine = `${n} coins added from bean exchange.`;
      break;
    case 'offline_recharge': {
      const sellerName = notifyMeta?.sellerName;
      const sellerHakaId = notifyMeta?.sellerHakaId;
      if (notifyMeta?.targetType === 'coin_seller') {
        dmLine =
          `Seller ${n} coins have been added to your offline wallet.\n\nHave a wonderful day ahead!\nRegards`;
      } else if (sellerName) {
        const senderPart = sellerHakaId ? `${sellerName}(ID:${sellerHakaId})` : sellerName;
        dmLine = `You received ${n} Offline Recharge coins from ${senderPart}.\n\nHave a wonderful day ahead!\nRegards`;
      } else {
        dmLine = `${n} coins were added to your wallet.`;
      }
      break;
    }
    default:
      dmLine = description?.trim()
        ? `${n} coins added. ${description.trim()}`
        : `${n} coins were added to your wallet.`;
  }

  if (newBalance > 0 && source !== 'offline_recharge') {
    dmLine += `\nNew balance: ${formatCoins(newBalance)} coins.`;
  }

  payload.dmLine = dmLine;
  const content = JSON.stringify(payload);
  const pushPreview = dmLine.split('\n')[0] ?? `${n} coins were added to your balance.`;

  return { content, pushPreview, source };
}

/**
 * Haka Team DM + account alert + optional live socket after wallet coin credit.
 */
export async function notifyWalletCoinsReceived(opts: {
  userId: string;
  coinsAmount: number;
  newBalance: number;
  reference: string;
  description?: string;
  notifyMeta?: WalletCoinsNotifyMeta;
}): Promise<void> {
  const { userId, coinsAmount, newBalance, reference, description, notifyMeta } = opts;
  if (coinsAmount <= 0) return;

  const hakaTeamId = getHakaTeamUserId();
  const { content, pushPreview, source } = buildCoinTransferPayload({
    coinsAmount,
    newBalance,
    reference,
    description,
    notifyMeta,
  });

  await insertServerDirectMessage({
    senderId: hakaTeamId,
    recipientId: userId,
    content,
    messageType: 'coin_transfer',
  });

  await notifyAccountAlert(userId, 'coin_transfer', 'Coins received', pushPreview, {
    senderId: hakaTeamId,
    messageType: 'coin_transfer',
    open: 'haka_team_dm',
    reference,
    source,
    coinsAmount,
    ...(notifyMeta?.transactionId ? { transactionId: notifyMeta.transactionId } : {}),
  });

  try {
    getIO().to(`user:${userId}`).emit('wallet:coins_received', {
      coinsAmount,
      newBalance,
      reference,
      source,
    });
  } catch {
    /* Socket.io not initialised (e.g. tests) */
  }
}

/** Fire-and-forget wrapper for post-commit notification. */
export function scheduleWalletCoinsNotify(opts: {
  userId: string;
  coinsAmount: number;
  newBalance: number;
  reference: string;
  description?: string;
  notifyMeta?: WalletCoinsNotifyMeta;
  skipHakaTeamNotify?: boolean;
}): void {
  if (opts.skipHakaTeamNotify || opts.coinsAmount <= 0) return;
  void notifyWalletCoinsReceived(opts).catch(() => {});
}
