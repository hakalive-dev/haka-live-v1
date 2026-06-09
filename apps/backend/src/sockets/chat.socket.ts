import { Server, Socket } from 'socket.io';
import * as chatService from '../modules/chat/chat.service';
import { notifyDmRecipient } from '../modules/chat/chat.push';
import { prisma } from '../config/prisma';
import { assertNoRiskBlock } from '../utils/risk-control';

/**
 * Chat Socket.io handlers — Feature 6
 *
 * On connection, every user auto-joins a personal room `user:<userId>`.
 * This allows the REST API to emit `new_dm` events to specific users
 * regardless of which Socket.io server instance they are connected to.
 *
 * Client → Server:
 *   dm:send          { recipientId, content }   → sends a DM and broadcasts new_dm
 *   dm:read          { otherUserId }            → marks conversation as read
 *
 * Server → Client:
 *   new_dm           { id, sender, recipient, content, isRead, createdAt }
 */
export function registerChatHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {
    const userId: string = socket.data.userId;

    // Auto-join personal room for DM delivery
    socket.join(`user:${userId}`);

    // Presence — touch lastSeenAt on connect, and again on disconnect.
    prisma.user
      .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
      .catch(() => {});

    socket.on('disconnect', () => {
      prisma.user
        .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
        .catch(() => {});
    });

    // ── dm:send ────────────────────────────────────────────────────────────
    socket.on('dm:send', async ({ recipientId, content }: { recipientId: string; content: string }, ack?: Function) => {
      try {
        await assertNoRiskBlock(userId, 'blockChat');
        const dm = await chatService.sendDM(userId, recipientId, content);

        // Emit to recipient's personal room
        io.to(`user:${recipientId}`).emit('new_dm', dm);

        // Also echo back to sender so they see it in real-time
        socket.emit('new_dm', dm);

        void notifyDmRecipient({
          recipientId,
          senderId: userId,
          preview: dm.content,
          messageType: dm.messageType ?? 'text',
        }).catch(() => {});

        ack?.({ ok: true, message: dm });
      } catch (err: any) {
        ack?.({ error: err.message ?? 'Failed to send message' });
      }
    });

    // ── dm:read ────────────────────────────────────────────────────────────
    socket.on('dm:read', async ({ otherUserId }: { otherUserId: string }, ack?: Function) => {
      try {
        const result = await chatService.markAsRead(userId, otherUserId);
        ack?.({ ok: true, ...result });
      } catch (err: any) {
        ack?.({ error: err.message ?? 'Failed to mark as read' });
      }
    });
  });
}
