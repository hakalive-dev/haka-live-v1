import type { DirectMessage } from '@/types';
import {
  coinTransferDmBody,
  parseLegacyDmJson,
  resolveStructuredDmCard,
  sellerRechargeApprovedDmBody,
  supportReplyDmBody,
  withdrawalUpdateDmPayload,
} from '@/utils/dmContent';

export type DmMessageActionKey = 'copy' | 'forward' | 'delete' | 'report';

export type DmActionAvailability = Record<DmMessageActionKey, boolean>;

const FORWARDABLE_TYPES = new Set(['text', 'image', 'gift']);
const STRUCTURED_TYPES = new Set([
  'agent_application',
  'sub_agent_invite',
  'coin_transfer',
  'seller_recharge_approved',
  'support_reply',
  'withdrawal_update',
  'system_notice',
]);

function isStructuredMessage(message: DirectMessage): boolean {
  if (message.messageType && STRUCTURED_TYPES.has(message.messageType)) return true;
  return resolveStructuredDmCard(message.messageType, message.content) != null;
}

export function getDmCopyText(message: DirectMessage): string | null {
  if (message.isDeleted) return null;

  const type = message.messageType ?? 'text';
  if (type === 'gift') {
    const name = message.giftName?.trim() || 'Gift';
    const qty = message.giftQty ?? 1;
    return `Sent ${name} x${qty}`;
  }
  if (type === 'image') {
    const caption = message.content?.trim();
    return caption || null;
  }

  const structured = resolveStructuredDmCard(type, message.content);
  if (structured === 'coin_transfer') {
    return coinTransferDmBody(message.content)?.label ?? message.content;
  }
  if (structured === 'seller_recharge_approved') {
    return sellerRechargeApprovedDmBody(message.content);
  }
  if (structured === 'support_reply') {
    return supportReplyDmBody(message.content);
  }
  if (structured === 'withdrawal_update') {
    const payload = withdrawalUpdateDmPayload(message.content);
    if (payload?.statusLabel) return payload.statusLabel;
    return 'Withdrawal update';
  }
  if (type === 'agent_application' || type === 'sub_agent_invite') {
    const legacy = parseLegacyDmJson(message.content);
    if (typeof legacy?.title === 'string') return legacy.title;
    if (typeof legacy?.body === 'string') return legacy.body;
  }

  const text = message.content?.trim();
  return text || null;
}

export function getDmActionAvailability(message: DirectMessage, isMine: boolean): DmActionAvailability {
  if (message.isDeleted) {
    return { copy: false, forward: false, delete: false, report: false };
  }

  const type = message.messageType ?? 'text';
  const structured = isStructuredMessage(message);
  const copyText = getDmCopyText(message);

  return {
    copy: copyText != null && copyText.length > 0,
    forward: !structured && FORWARDABLE_TYPES.has(type),
    delete: true,
    report: !isMine,
  };
}
