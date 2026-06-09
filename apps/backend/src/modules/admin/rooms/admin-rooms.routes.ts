import { Router } from 'express';
import * as ctrl from './admin-rooms.controller';
import { requireAdminRole, requirePermission } from '../../../middleware/admin-auth.middleware';

const router = Router();

// Room pin management (before /:id to avoid route conflicts)
router.get('/pinned',            requirePermission('room.view'), ctrl.listPinnedRooms);
router.post('/:id/pin',         requirePermission('room.force_end'), ctrl.pinRoom);
router.delete('/:id/pin',       requirePermission('room.force_end'), ctrl.unpinRoom);
router.get('/:id/pin',          ctrl.getRoomPinStatus);

// Room reset endpoints
router.post('/:id/reset-cover',        requirePermission('room.force_end'), ctrl.resetRoomCover);
router.post('/:id/reset-announcement', requirePermission('room.force_end'), ctrl.resetRoomAnnouncement);

router.get('/',                  ctrl.listRooms);
router.get('/:id',              ctrl.getRoomDetail);
router.get('/:id/messages',     ctrl.getRoomMessages);
router.post('/:id/force-end',   requirePermission('room.force_end'), ctrl.forceEndRoom);
router.get('/:id/viewers',      requirePermission('room.monitor'), ctrl.getViewers);
router.post('/:id/kick',        requirePermission('room.kick_user'), ctrl.kickUserFromRoom);
router.post('/:id/seats/:pos/lock', requirePermission('room.seat_manage'), ctrl.setSeatLock);
router.post('/:id/seats/:pos/mute', requirePermission('room.seat_manage'), ctrl.setSeatMute);
router.post('/:id/seats/:pos/kick', requirePermission('room.seat_manage'), ctrl.kickFromSeat);
router.get('/:id/bans',         requirePermission('room.ban_manage'), ctrl.listBans);
router.post('/:id/bans',        requirePermission('room.ban_manage'), ctrl.createBan);
router.delete('/:id/bans/:banId', requirePermission('room.ban_manage'), ctrl.deleteBan);
router.patch('/:id',            requireAdminRole('super_admin'), ctrl.updateRoom);
router.delete('/:id',           requireAdminRole('super_admin'), ctrl.deleteRoom);

export default router;
