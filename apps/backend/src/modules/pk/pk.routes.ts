import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import * as ctrl from './pk.controller';

const router = Router();
router.use(authenticate);

router.get('/live-rooms',                ctrl.getLiveRooms);
router.post('/queue/join',               ctrl.joinQueue);
router.post('/queue/leave',              ctrl.leaveQueue);
router.post('/invite',                   ctrl.sendInvite);
router.post('/invite/:inviteId/respond', ctrl.respondToInvite);

export default router;
