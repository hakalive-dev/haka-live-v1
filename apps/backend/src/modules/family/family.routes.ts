import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import * as ctrl from './family.controller';

const router = Router();

router.use(authenticate);

router.get('/',                   ctrl.listFamilies);
router.get('/me',                 ctrl.getMyFamily);
router.get('/:familyId',          ctrl.getFamily);
router.post('/',                  ctrl.createFamily);
router.patch('/',                 ctrl.updateFamily);
router.post('/:familyId/join',    ctrl.joinFamily);
router.post('/leave',             ctrl.leaveFamily);
router.delete('/',                ctrl.disbandFamily);
router.post('/members/promote',   ctrl.promoteMember);
router.post('/members/kick',      ctrl.kickMember);

export default router;
