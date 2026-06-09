import {
  isWithdrawalUpdateDmPayload,
  type WithdrawalUpdateDmPayload,
} from '@haka-live/shared-types/withdrawal-message-dm';

/** Parse legacy JSON payloads stored in DM content before we switched to plain text. */
export function parseLegacyDmJson(content: string): Record<string, unknown> | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const o = JSON.parse(trimmed) as Record<string, unknown>;
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

export function sellerRechargeApprovedDmBody(content: string): string {
  const legacy = parseLegacyDmJson(content);
  if (legacy?.kind === 'seller_recharge_approved' || legacy?.coinsAdded != null) {
    const coinsAdded = Number(legacy.coinsAdded ?? 0);
    const amountUsd = Number(legacy.amountUsd ?? 0);
    const newBalance = Number(legacy.newBalance ?? 0);
    const lines = [
      amountUsd > 0
        ? `Your $${amountUsd.toFixed(2)} recharge was approved.`
        : 'Your recharge was approved.',
      `${coinsAdded.toLocaleString()} coins were added to your coin seller balance.`,
    ];
    if (newBalance > 0) {
      lines.push(`New balance: ${newBalance.toLocaleString()} coins.`);
    }
    return lines.join('\n');
  }
  return content;
}

export function coinTransferDmBody(content: string): { label: string } | null {
  const legacy = parseLegacyDmJson(content);
  if (!legacy || legacy.kind !== 'coin_transfer') return null;

  const dmLine = typeof legacy.dmLine === 'string' ? legacy.dmLine.trim() : '';
  if (dmLine) {
    return { label: dmLine };
  }

  const coinsAmount = Number(legacy.coinsAmount ?? 0);
  const n = coinsAmount.toLocaleString();
  const source = typeof legacy.source === 'string' ? legacy.source : '';
  const targetType = String(legacy.targetType ?? '');
  const sellerName = typeof legacy.sellerName === 'string' ? legacy.sellerName : null;
  const sellerHakaId = typeof legacy.sellerHakaId === 'string' ? legacy.sellerHakaId : null;
  const packageName = typeof legacy.packageName === 'string' ? legacy.packageName : null;
  const eventName = typeof legacy.eventName === 'string' ? legacy.eventName : null;
  const newBalance = Number(legacy.newBalance ?? 0);
  const balanceSuffix =
    source !== 'offline_recharge' && newBalance > 0
      ? `\nNew balance: ${newBalance.toLocaleString()} coins.`
      : '';

  if (targetType === 'coin_seller') {
    return {
      label: `Seller ${n} coins have been added to your offline wallet.\n\nHave a wonderful day ahead!\nRegards`,
    };
  }

  switch (source) {
    case 'official_recharge':
      return {
        label: packageName
          ? `${n} coins added from official recharge (${packageName}).${balanceSuffix}`
          : `${n} coins added from official recharge.${balanceSuffix}`,
      };
    case 'welcome_gift':
      return { label: `Welcome gift: ${n} coins added to your wallet.${balanceSuffix}` };
    case 'invite_reward':
      return { label: `Invite reward: ${n} coins added to your wallet.${balanceSuffix}` };
    case 'agent_sale':
      return { label: `${n} coins from your agent purchase.${balanceSuffix}` };
    case 'admin_credit':
      return { label: `${n} coins credited to your account.${balanceSuffix}` };
    case 'reversal':
      return { label: `${n} coins were restored to your wallet.${balanceSuffix}` };
    case 'event_reward':
      return {
        label: eventName
          ? `Event reward (${eventName}): ${n} coins added.${balanceSuffix}`
          : `Event reward: ${n} coins added to your wallet.${balanceSuffix}`,
      };
    case 'offline_recharge':
      if (sellerName) {
        const senderPart = sellerHakaId ? `${sellerName}(ID:${sellerHakaId})` : sellerName;
        return {
          label: `You received ${n} Offline Recharge coins from ${senderPart}.\n\nHave a wonderful day ahead!\nRegards`,
        };
      }
      break;
    default:
      break;
  }

  if (sellerName) {
    const senderPart = sellerHakaId ? `${sellerName}(ID:${sellerHakaId})` : sellerName;
    return {
      label: `You received ${n} Offline Recharge coins from ${senderPart}.\n\nHave a wonderful day ahead!\nRegards`,
    };
  }

  return { label: `${n} coins were added to your wallet.${balanceSuffix}` };
}

export function supportReplyDmBody(content: string): string {
  return content.trim() || 'Haka Team replied to your support request.';
}

export function withdrawalUpdateDmPayload(content: string): WithdrawalUpdateDmPayload | null {
  const legacy = parseLegacyDmJson(content);
  if (isWithdrawalUpdateDmPayload(legacy)) return legacy;
  return null;
}

export function resolveStructuredDmCard(
  messageType: string | undefined,
  content: string,
): 'seller_recharge_approved' | 'coin_transfer' | 'support_reply' | 'withdrawal_update' | null {
  if (messageType === 'seller_recharge_approved') return 'seller_recharge_approved';
  if (messageType === 'coin_transfer') return 'coin_transfer';
  if (messageType === 'support_reply') return 'support_reply';
  if (messageType === 'withdrawal_update') return 'withdrawal_update';
  const legacy = parseLegacyDmJson(content);
  if (legacy?.kind === 'seller_recharge_approved') return 'seller_recharge_approved';
  if (legacy?.kind === 'coin_transfer') return 'coin_transfer';
  if (isWithdrawalUpdateDmPayload(legacy)) return 'withdrawal_update';
  return null;
}

export function dmInboxPreview(messageType: string | undefined, content: string): string | null {
  if (messageType === 'seller_recharge_approved') {
    const body = sellerRechargeApprovedDmBody(content);
    const first = body.split('\n')[0]?.trim();
    return first || 'Recharge approved';
  }
  if (messageType === 'coin_transfer') {
    const parsed = coinTransferDmBody(content);
    if (parsed) return parsed.label;
    return 'Coins received';
  }
  if (messageType === 'support_reply') {
    const lines = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('Re:') && !l.startsWith('Issue:'));
    const reply = lines.join(' ').trim();
    if (!reply) return 'Support replied to your request';
    return reply.length > 80 ? `${reply.slice(0, 79)}…` : reply;
  }
  if (messageType === 'face_verification_approved') {
    const first = content.split('\n')[0]?.trim();
    return first || 'Face verification approved';
  }
  if (messageType === 'face_verification_rejected') {
    const first = content.split('\n')[0]?.trim();
    return first || 'Face verification not approved';
  }
  if (messageType === 'withdrawal_update') {
    const parsed = withdrawalUpdateDmPayload(content);
    if (parsed) return `${parsed.statusLabel}: ${parsed.paymentAmount}`;
    return 'Withdrawal update';
  }
  if (messageType === 'image') {
    const caption = content.trim();
    if (caption) {
      return caption.length > 80 ? `${caption.slice(0, 79)}…` : caption;
    }
    return 'Sent a photo';
  }
  return null;
}
