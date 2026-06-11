import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import * as ctrl from './gifts.controller';

const router = Router();

router.use(authenticate);

router.get('/',              ctrl.getCatalogue);
router.get('/history',       ctrl.getSentHistory);
router.get('/lucky/history', ctrl.getLuckyHistory);
router.get('/lucky/room/:roomId/winners', ctrl.getRoomLuckyWinners);
router.get('/received/:userId', ctrl.getReceived);
router.post('/send',         ctrl.sendGift);

export default router;
