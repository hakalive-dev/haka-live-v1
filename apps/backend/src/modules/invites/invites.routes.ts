import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import * as ctrl from './invites.controller';

const router = Router();

router.use(authenticate);

router.post('/generate', ctrl.generate);
router.post('/accept',   ctrl.accept);
router.get('/my',        ctrl.getMyInvites);
router.get('/summary',   ctrl.getSummary);
router.get('/leaderboard', ctrl.getInviteLeaderboard);
router.get('/shareholder-rewards', ctrl.getShareholderRewards);

export default router;
