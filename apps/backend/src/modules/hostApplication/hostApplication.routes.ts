import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.middleware';
import * as ctrl from './hostApplication.controller';

const router = Router();

router.use(authenticate);

// User: submit application
router.post('/apply-independent', ctrl.applyIndependent);
router.post('/apply-with-agent', ctrl.applyWithAgent);

// Agent: invite a user
// Do not rely on JWT role claim (can be stale). Service layer verifies DB role.
router.post('/invite', ctrl.inviteHost);

// User: view own application
router.get('/me', ctrl.getMyApplication);

// Invitee: accept or decline an agency invitation
router.post('/:id/accept',  ctrl.acceptInvitation);
router.post('/:id/decline', ctrl.declineInvitation);

// Admin: list pending applications
router.get('/pending', ctrl.getPendingApplications);

// Admin: approve / reject
router.post('/:id/approve', ctrl.approveApplication);
router.post('/:id/reject',  ctrl.rejectApplication);

export default router;
