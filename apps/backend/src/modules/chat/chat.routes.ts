import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import * as ctrl from './chat.controller';
import { chatImageUpload } from '../../utils/upload';

const router = Router();

// All chat routes require authentication
router.use(authenticate);

// ── Room Messages ────────────────────────────────────────────────────────────
router.get('/rooms/:roomId/messages',           ctrl.getRoomMessages);
router.post('/rooms/:roomId/messages',          ctrl.sendRoomMessage);
router.post('/rooms/:roomId/images',            chatImageUpload.single('file'), ctrl.sendRoomImage);

// ── Team announcement (pinned broadcast; literal paths before :userId) ───────
router.get('/team-announcement',                  ctrl.getTeamAnnouncement);
router.post('/team-announcement/read',            ctrl.markTeamAnnouncementRead);

// ── Conversations ────────────────────────────────────────────────────────────
router.get('/messages-badge',                    ctrl.getMessagesBadge);
router.get('/conversations',                     ctrl.getConversations);
router.get('/conversations/friends',             ctrl.getFriendConversations);
router.delete('/conversations/messages/:messageId', ctrl.deleteDMMessage);
router.post('/conversations/messages/:messageId/forward', ctrl.forwardDMMessage);
router.get('/conversations/:userId/messages',    ctrl.getMessages);
router.post('/conversations/:userId/messages',   ctrl.sendDM);
router.post('/conversations/:userId/images',     chatImageUpload.single('file'), ctrl.sendDMImage);
router.post('/conversations/:userId/gift',       ctrl.sendGiftDM);
router.post('/conversations/:userId/read',       ctrl.markAsRead);

// ── Friends ──────────────────────────────────────────────────────────────────
router.get('/friends/online',                    ctrl.getOnlineFriends);

// ── 1:1 Video Call ─────────────────────────────────────────────────────────────
router.post('/conversations/:userId/call-invite',  ctrl.postCallInvite);
router.post('/conversations/:userId/call-answer',  ctrl.postCallAnswer);
router.post('/conversations/:userId/call-decline', ctrl.postCallDecline);
router.post('/conversations/:userId/call-end',     ctrl.postCallEnd);
router.post('/conversations/:userId/call-cancel', ctrl.postCallCancel);
router.get('/conversations/:userId/call-token',   ctrl.getCallToken);

export default router;
