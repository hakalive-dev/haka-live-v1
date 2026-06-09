import { Router } from 'express';
import * as ctrl from './admin-games.controller';

const router = Router();

router.get('/',                ctrl.listGames);
router.get('/:id',             ctrl.getGameDetail);
router.post('/',               ctrl.createGame);
router.patch('/:id',           ctrl.updateGame);
router.delete('/:id',          ctrl.deleteGame);
router.patch('/:id/status',    ctrl.toggleGameStatus);
router.post('/:id/ping',       ctrl.pingGameApi);

export default router;
