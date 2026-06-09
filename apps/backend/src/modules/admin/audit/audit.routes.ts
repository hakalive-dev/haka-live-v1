import { Router } from 'express';
import * as ctrl from './audit.controller';

const router = Router();

router.get('/', ctrl.listAuditLogs);

export default router;
