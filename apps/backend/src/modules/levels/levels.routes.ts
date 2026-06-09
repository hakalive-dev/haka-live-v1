import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import * as ctrl from './levels.controller';

const router = Router();

router.use(authenticate);

router.get('/tiers',               ctrl.getTiers);
router.get('/me',                  ctrl.getMyLevel);
router.get('/user/:userId',        ctrl.getUserLevel);
router.get('/leaderboard/rich',    ctrl.getRichLeaderboard);
router.get('/leaderboard/charm',   ctrl.getCharmLeaderboard);

export default router;
