import { prisma } from '../../config/prisma';
import { createNotification } from '../notifications/notifications.service';

function postLabel(postType: string): string {
  return postType === 'video' ? 'video' : 'moment';
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

async function loadActor(actorId: string) {
  return prisma.user.findUnique({
    where: { id: actorId },
    select: { id: true, displayName: true, avatar: true },
  });
}

function sendMomentNotification(
  recipientId: string,
  actorId: string,
  actor: { displayName: string; avatar: string },
  type: string,
  title: string,
  body: string,
  momentId: string,
  postType: string,
  extra?: Record<string, unknown>,
) {
  if (recipientId === actorId) return;

  void createNotification(
    recipientId,
    type,
    title,
    body,
    {
      type,
      momentId,
      actorId,
      postType,
      open: 'actor_profile',
      ...extra,
    },
    actor.avatar || undefined,
  ).catch(() => {});
}

export async function notifyMomentLiked(
  authorId: string,
  actorId: string,
  momentId: string,
  postType: string,
) {
  const actor = await loadActor(actorId);
  if (!actor) return;

  const label = postLabel(postType);
  sendMomentNotification(
    authorId,
    actorId,
    actor,
    'moment_like',
    'New like',
    `${actor.displayName} liked your ${label}`,
    momentId,
    postType,
  );
}

export async function notifyMomentCommented(
  authorId: string,
  actorId: string,
  momentId: string,
  postType: string,
  commentText: string,
) {
  const actor = await loadActor(actorId);
  if (!actor) return;

  const label = postLabel(postType);
  const preview = truncate(commentText, 80);
  sendMomentNotification(
    authorId,
    actorId,
    actor,
    'moment_comment',
    'New comment',
    `${actor.displayName} commented on your ${label}: "${preview}"`,
    momentId,
    postType,
    { commentPreview: preview },
  );
}

export async function notifyMomentShared(
  authorId: string,
  actorId: string,
  momentId: string,
  postType: string,
) {
  const actor = await loadActor(actorId);
  if (!actor) return;

  const label = postLabel(postType);
  sendMomentNotification(
    authorId,
    actorId,
    actor,
    'moment_share',
    'Post shared',
    `${actor.displayName} shared your ${label}`,
    momentId,
    postType,
  );
}

export async function notifyMomentGifted(
  authorId: string,
  actorId: string,
  momentId: string,
  postType: string,
  giftName: string,
) {
  const actor = await loadActor(actorId);
  if (!actor) return;

  const label = postLabel(postType);
  sendMomentNotification(
    authorId,
    actorId,
    actor,
    'moment_gift',
    'Gift received',
    `${actor.displayName} sent you ${giftName} on your ${label}`,
    momentId,
    postType,
    { giftName },
  );
}
