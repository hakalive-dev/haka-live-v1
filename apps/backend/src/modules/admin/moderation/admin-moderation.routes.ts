import { Router } from 'express';
import * as ctrl from './admin-moderation.controller';

const router = Router();

// Reports
router.get('/reports',              ctrl.listReports);
router.post('/reports/:id/review',  ctrl.reviewReport);

// Bans
router.get('/bans',                 ctrl.listBans);
router.post('/bans',                ctrl.createBan);
router.patch('/bans/:id/result',    ctrl.updateBanResult);
router.delete('/bans/:id',          ctrl.liftBan);

// Room Bans
router.post('/room-bans',           ctrl.createRoomBan);
router.delete('/room-bans/:id',     ctrl.liftRoomBan);

// Device Bans
router.get('/device-bans',              ctrl.listDeviceBans);
router.post('/device-ban',              ctrl.createDeviceBan);
router.delete('/device-ban/:deviceId',  ctrl.liftDeviceBan);

// KYC / Verify
router.post('/users/:id/verify',    ctrl.verifyUser);
router.post('/users/:id/unverify',  ctrl.unverifyUser);

export default router;
