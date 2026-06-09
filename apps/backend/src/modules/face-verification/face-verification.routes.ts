import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import * as ctrl from './face-verification.controller';

const router = Router();
router.use(authenticate);

router.get('/challenges', ctrl.getChallenges);
router.get('/status', ctrl.getStatus);
router.post('/session', ctrl.createSession);
router.post('/session/:sessionId/frame/upload', ctrl.signFrameUpload);
router.post('/session/:sessionId/frame', ctrl.registerFrame);
router.post('/session/:sessionId/submit', ctrl.submitSession);

export default router;
