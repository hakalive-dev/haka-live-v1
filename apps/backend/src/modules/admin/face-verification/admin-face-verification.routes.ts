import { Router } from 'express';
import * as ctrl from './admin-face-verification.controller';

const router = Router();

router.get('/', ctrl.listPending);
router.get('/:sessionId', ctrl.getDetail);
router.post('/:sessionId/approve', ctrl.approve);
router.post('/:sessionId/reject', ctrl.reject);

export default router;
