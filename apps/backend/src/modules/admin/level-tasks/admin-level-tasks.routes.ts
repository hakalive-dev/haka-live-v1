import { Router } from 'express';
import * as ctrl from './admin-level-tasks.controller';

const router = Router();

router.get('/settings', ctrl.getSettings);
router.patch('/settings', ctrl.patchSettings);
router.get('/tiers', ctrl.listTiers);
router.post('/tiers', ctrl.createTier);
router.patch('/tiers/:id', ctrl.updateTier);
router.delete('/tiers/:id', ctrl.deleteTier);
router.get('/daily', ctrl.listDaily);

export default router;
