import { Router } from 'express';
import { authenticate, optionalAuth } from '../../middleware/auth.middleware';
import { adminUpload, audioUpload } from '../../utils/upload';
import * as ctrl from './rooms.controller';

const router = Router();

// ── Room CRUD ─────────────────────────────────────────────────────────────────
router.post('/',    authenticate, ctrl.createRoom);
router.get('/',     optionalAuth, ctrl.listRooms);
router.get('/mine', authenticate, ctrl.getMyActiveRoom);
// NOTE: Do not register `GET /:id` before `GET /:id/...` routes — Express can mishandle
// multi-segment paths. `getRoom` is registered at the bottom of this file.
router.patch('/:id', authenticate, ctrl.updateRoom);
router.post('/:id/cover', authenticate, adminUpload.single('file'), ctrl.uploadCover);

// ── Chat lock / clear (host only) ────────────────────────────────────────────
router.patch('/:id/chat-lock',  authenticate, ctrl.toggleChatLock);
router.post('/:id/clear-chat',  authenticate, ctrl.clearChat);
router.patch('/:id/public-msg', authenticate, ctrl.togglePublicMsg);
// ── Music queue ────────────────────────────────────────────────────────────────
router.get('/:id/music/queue',              authenticate, ctrl.getMusicQueue);
router.post('/:id/music/queue/from-library', authenticate, ctrl.addFromLibrary);
router.post('/:id/music/queue',             authenticate, audioUpload.single('file'), ctrl.addMusicTrack);
router.delete('/:id/music/queue/:trackId',  authenticate, ctrl.removeMusicTrack);
router.patch('/:id/music/queue/reorder',    authenticate, ctrl.reorderMusicQueue);
router.post('/:id/music/skip',              authenticate, ctrl.skipMusicTrack);
router.patch('/:id/music/loop',             authenticate, ctrl.setMusicLoop);
// Legacy compat
router.post('/:id/music',       authenticate, audioUpload.single('file'), ctrl.setMusic);
router.delete('/:id/music',     authenticate, ctrl.clearMusic);
router.patch('/:id/hd-mic',     authenticate, ctrl.toggleHdMic);

// ── Theme ─────────────────────────────────────────────────────────────────────
router.patch('/:id/theme',  authenticate, ctrl.applyTheme);
router.delete('/:id/theme', authenticate, ctrl.resetTheme);

// ── Lifecycle ─────────────────────────────────────────────────────────────────
router.post('/:id/start', authenticate, ctrl.startRoom);
router.post('/:id/end',   authenticate, ctrl.endRoom);

// ── Agora RTC token ──────────────────────────────────────────────────────────
router.get('/:id/token', authenticate, ctrl.getToken);

// ── Contribution ranking ─────────────────────────────────────────────────────
router.get('/:id/contributions', ctrl.getContributions);

// ── Room stats ───────────────────────────────────────────────────────────────
router.get('/:id/stats', optionalAuth, ctrl.getRoomStats);

// ── Room Admins ───────────────────────────────────────────────────────────────
router.get('/:id/admins',                   ctrl.listRoomAdmins);
router.post('/:id/admins',     authenticate, ctrl.addRoomAdmin);
router.delete('/:id/admins/:userId', authenticate, ctrl.removeRoomAdmin);

// ── Viewers (live socket participants) ────────────────────────────────────────
router.get('/:id/viewers', ctrl.getViewers);
router.post('/:id/kick', authenticate, ctrl.kickUserFromRoom);

// ── Members (permanent joins) ─────────────────────────────────────────────────
router.post('/:id/members', authenticate, ctrl.joinRoom);
router.delete('/:id/members', authenticate, ctrl.unjoinRoom);
router.get('/:id/members', authenticate, ctrl.listRoomMembers);
router.get('/:id/members/me', authenticate, ctrl.isRoomMember);

// ── Seats ─────────────────────────────────────────────────────────────────────
router.get('/:id/seat-applicants', authenticate, ctrl.listSeatApplicants);
router.get('/:id/seats',                   ctrl.getSeats);
router.post('/:id/seats/invite',     authenticate, ctrl.inviteToSeat);
router.post('/:id/seats/:pos/take',  authenticate, ctrl.takeSeat);
router.post('/:id/seats/:pos/leave', authenticate, ctrl.leaveSeat);
router.post('/:id/seats/:pos/lock',  authenticate, ctrl.lockSeat);
router.post('/:id/seats/:pos/kick',  authenticate, ctrl.kickFromSeat);

// ── Calculator ────────────────────────────────────────────────────────────────
router.post('/:id/calculator/start',        authenticate, ctrl.startCalculator);
router.post('/:id/calculator/end',          authenticate, ctrl.endCalculator);
router.get('/:id/calculator',                             ctrl.getCalculator);
router.get('/:id/calculator/contributors',                ctrl.getCalculatorContributors);
router.get('/:id/calculator/recipients/:userId/contributors', ctrl.getCalculatorRecipientContributors);

// Single-segment `GET /:id` must stay last so paths like `/:id/seat-applicants` match first.
router.get('/:id', optionalAuth, ctrl.getRoom);

export default router;
