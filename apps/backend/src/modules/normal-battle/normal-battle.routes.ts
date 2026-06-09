import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import * as ctrl from './normal-battle.controller';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.post('/:roomId/battle', ctrl.startBattle);
router.post('/:roomId/battle/cancel', ctrl.cancelBattle);

export default router;
