import { Router } from 'express';
import * as ctrl from './admin-families.controller';

const router = Router();

router.get('/',                       ctrl.list);
router.get('/:id',                    ctrl.detail);
router.patch('/:id',                  ctrl.update);
router.delete('/:id',                 ctrl.remove);
router.delete('/:id/members/:userId', ctrl.removeMember);

export default router;
