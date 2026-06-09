import { Router } from 'express';
import * as ctrl from './dashboard.controller';

const router = Router();

router.get('/stats',        ctrl.getStats);
router.get('/recent-users', ctrl.getRecentUsers);
router.get('/recent-rooms', ctrl.getRecentRooms);
router.get('/top-hosts',    ctrl.getTopHosts);
router.get('/top-agents',   ctrl.getTopAgents);

export default router;
