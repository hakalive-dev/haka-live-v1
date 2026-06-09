import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.middleware';
import * as ctrl from './agency.controller';

const router = Router();

router.use(authenticate);

// Become Agent: discover parent (any authenticated user)
router.get('/designated-admins', ctrl.listDesignatedAdmins);
router.get('/bind-search', ctrl.bindSearchAgencies);
router.get('/lookup-parent-agent', ctrl.lookupParentAgent);

// ── Agent-facing routes (agent role required) ────────────────────────────────

// Agency search (by name, owner displayName, or owner hakaId)
router.get('/search', requireRole('agent'), ctrl.searchAgencies);

// Agency summary (tier, hosts, beans, commission)
router.get('/summary', requireRole('agent'), ctrl.getAgencySummary);
router.get('/center-bootstrap', requireRole('agent'), ctrl.getCenterBootstrap);

// Earn Money — Learn Promotion cards (admin-managed)
router.get('/learn-promotions', requireRole('agent'), ctrl.getLearnPromotions);

// Host roster
router.get('/hosts', requireRole('agent'), ctrl.getHostRoster);
router.get('/hosts/:hostId/stats', requireRole('agent'), ctrl.getHostStats);

// Pending leave / change-agency requests from hosts (current agent approves)
router.get('/host-change-requests/pending', requireRole('agent'), ctrl.listPendingHostChangeRequests);
router.post('/host-change-requests/:id/approve', requireRole('agent'), ctrl.approveHostChangeRequest);
router.post('/host-change-requests/:id/reject', requireRole('agent'), ctrl.rejectHostChangeRequest);

// Pending sub-agent applications (parent agency owner)
router.get('/agent-applications/pending', requireRole('agent'), ctrl.listPendingAgentApplications);
router.post('/agent-applications/:id/approve', requireRole('agent'), ctrl.approveAgentApplication);
router.post('/agent-applications/:id/reject', requireRole('agent'), ctrl.rejectAgentApplication);

// Pending host applications assigned to this agent
router.get('/host-applications/pending', requireRole('agent'), ctrl.listPendingHostApplications);
router.post('/host-applications/:id/approve', requireRole('agent'), ctrl.approveHostApplication);
router.post('/host-applications/:id/reject', requireRole('agent'), ctrl.rejectHostApplication);

// Sub-agent invitations (owner → user, user accepts in chat)
router.post('/sub-agent-invitations', requireRole('agent'), ctrl.createSubAgentInvitation);
router.get('/sub-agent-invitations/pending', requireRole('agent'), ctrl.listPendingSubAgentInvitations);
router.post('/sub-agent-invitations/:id/accept', ctrl.acceptSubAgentInvitation);
router.post('/sub-agent-invitations/:id/decline', ctrl.declineSubAgentInvitation);
router.post('/sub-agent-invitations/:id/cancel', requireRole('agent'), ctrl.cancelSubAgentInvitation);

// Daily analytics (host bean income + agent commission per day)
router.get('/analytics/daily', requireRole('agent'), ctrl.getAgencyDailyAnalytics);

// Coin sales (agent top-up)
router.post('/sales', requireRole('agent'), ctrl.logAgentSale);
router.get('/sales', requireRole('agent'), ctrl.getAgentTransactions);

// Owner commission-ledger (paginated, cursor-based)
router.get('/commission-ledger', requireRole('agent'), ctrl.getOwnerCommissionLedger);

// ── Host-facing routes (host or agent) ───────────────────────────────────────

// Host: get info about own agent
router.get('/my-agent', requireRole('host', 'agent'), ctrl.getMyAgentInfo);

// Host change requests (leave / change agent)
router.post('/change-request',       requireRole('host'), ctrl.submitChangeRequest);
router.get('/change-request',        requireRole('host'), ctrl.getMyChangeRequest);
router.delete('/change-request/:id', requireRole('host'), ctrl.cancelChangeRequest);

// Agent application (any authenticated user can apply)
router.post('/apply-as-agent',       ctrl.submitAgentApplication);
router.get('/my-agent-application',  ctrl.getMyAgentApplication);

export default router;
