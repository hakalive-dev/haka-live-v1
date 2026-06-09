import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import * as ctrl from './payment-methods.controller';

const router = Router();

router.use(authenticate);

router.get('/',            ctrl.list);
router.get('/has-method',  ctrl.hasMethod);
router.post('/bind',       ctrl.bind);
router.put('/:id/default', ctrl.setDefault);
router.delete('/:id',      ctrl.remove);

export default router;
