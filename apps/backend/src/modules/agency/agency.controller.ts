import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as service from './agency.service';
import * as crSvc from './change-request.service';
import * as agentAppSvc from './agent-application.service';
import * as subAgentInviteSvc from './sub-agent-invitation.service';
import * as hostAppSvc from '../hostApplication/hostApplication.service';
import { listActiveDesignatedBecomeAgencyAdminsForMobile } from '../admin/designated-become-agency-admins/designated-become-agency-admins.service';
import { ok, created, fail } from '../../utils/response';

// ── Schemas ────────────────────────────────────────────────────────────────────

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const logSaleSchema = z.object({
  customerId: z.string().uuid('customerId must be a valid UUID'),
  coinsSold: z.number().int().positive('coinsSold must be a positive integer'),
  amountCollected: z.number().positive('amountCollected must be a positive number'),
  currency: z.string().min(1).max(10).default('GBP'),
  notes: z.string().max(500).optional().default(''),
});

// ── Agency Summary ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/agency/summary
 */
export async function getAgencySummary(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const summary = await service.getAgencySummary(req.user!.id);
    ok(res, summary);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/agency/center-bootstrap
 */
export async function getCenterBootstrap(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await service.getCenterBootstrap(req.user!.id);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

// ── Host Roster ────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/agency/hosts?page=1&limit=20
 */
export async function getHostRoster(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors);
      return;
    }
    const result = await service.getHostRoster(req.user!.id, parsed.data.page, parsed.data.limit);
    ok(res, result);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/agency/hosts/:hostId/stats
 */
export async function getHostStats(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await service.getHostStats(req.user!.id, req.params.hostId);
    ok(res, result);
  } catch (err) {
    next(err);
  }
}

// ── Daily Analytics ────────────────────────────────────────────────────────────

const dailyAnalyticsSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

/**
 * GET /api/v1/agency/analytics/daily?days=30
 */
export async function getAgencyDailyAnalytics(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = dailyAnalyticsSchema.safeParse(req.query);
    if (!parsed.success) {
      fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors);
      return;
    }
    const result = await service.getAgencyDailyAnalytics(req.user!.id, parsed.data.days);
    ok(res, result);
  } catch (err) {
    next(err);
  }
}

// ── My Agent Info (host-facing) ────────────────────────────────────────────────

/**
 * GET /api/v1/agency/my-agent
 */
export async function getMyAgentInfo(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await service.getMyAgentInfo(req.user!.id);
    ok(res, result);
  } catch (err) {
    next(err);
  }
}

// ── Agent Transactions ────────────────────────────────────────────────────────

/**
 * POST /api/v1/agency/sales
 * Body: { customerId, coinsSold, amountCollected, currency?, notes? }
 */
export async function logAgentSale(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = logSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors);
      return;
    }
    const { customerId, coinsSold, amountCollected, currency, notes } = parsed.data;
    const tx = await service.logAgentSale(
      req.user!.id,
      customerId,
      coinsSold,
      amountCollected,
      currency,
      notes,
    );
    created(res, tx, 'Sale logged and coins credited');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/agency/sales?page=1&limit=20
 */
export async function getAgentTransactions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors);
      return;
    }
    const result = await service.getAgentTransactions(
      req.user!.id,
      parsed.data.page,
      parsed.data.limit,
    );
    ok(res, result);
  } catch (err) {
    next(err);
  }
}

// ── Owner commission-ledger ────────────────────────────────────────────────────

const ownerLedgerQuerySchema = z.object({
  cursor: z.string().optional(),
  limit:  z.coerce.number().int().positive().max(200).optional(),
  from:   z.string().datetime({ offset: true }).optional(),
  to:     z.string().datetime({ offset: true }).optional(),
});

/**
 * GET /api/v1/agency/commission-ledger?cursor=&limit=&from=&to=
 */
export async function getOwnerCommissionLedger(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = ownerLedgerQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors);
      return;
    }
    const result = await service.listOwnerCommissionLedger({
      callerUserId: req.user!.id,
      ...parsed.data,
    });
    ok(res, result);
  } catch (err) {
    next(err);
  }
}

// ── Host Change Requests ──────────────────────────────────────────────────────

const submitChangeRequestSchema = z.object({
  type:      z.enum(['leave', 'change']),
  /** UUID, hakaId, or username when type === change */
  toAgentId: z.string().min(1).max(200).nullable().optional(),
  reason:    z.string().max(500).default(''),
});

export async function submitChangeRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const body = submitChangeRequestSchema.parse(req.body);
    const result = await crSvc.submitChangeRequest(
      req.user!.id, body.type, body.toAgentId ?? null, body.reason,
    );
    ok(res, result);
  } catch (err) { next(err); }
}

export async function listPendingHostChangeRequests(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await crSvc.listPendingChangeRequestsForAgent(req.user!.id));
  } catch (err) { next(err); }
}

const rejectChangeBodySchema = z.object({
  note: z.string().max(500).optional().default(''),
});

export async function approveHostChangeRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await crSvc.agentApproveChangeRequest(req.user!.id, req.params.id);
    ok(res, result, 'Request approved');
  } catch (err) { next(err); }
}

export async function rejectHostChangeRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const body = rejectChangeBodySchema.parse(req.body ?? {});
    const result = await crSvc.agentRejectChangeRequest(req.user!.id, req.params.id, body.note);
    ok(res, result, 'Request rejected');
  } catch (err) { next(err); }
}

export async function getMyChangeRequest(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await crSvc.getMyChangeRequest(req.user!.id));
  } catch (err) { next(err); }
}

export async function cancelChangeRequest(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await crSvc.cancelChangeRequest(req.user!.id, req.params.id));
  } catch (err) { next(err); }
}

// ── Agent Applications ────────────────────────────────────────────────────────

const applyAsAgentSchema = z
  .object({
    proposedName: z.string().min(1).max(100),
    country: z.string().max(100).default(''),
    /** UUID, hakaId, or username of parent agency owner (sub-agent path) */
    parentAgentId: z.string().min(1).max(200).optional(),
    /** Staff AdminUser Haka ID (root auto-approve path) */
    designatedAdminHakaId: z.string().min(1).max(100).optional(),
  })
  .refine((d) => Boolean(d.parentAgentId?.trim()) !== Boolean(d.designatedAdminHakaId?.trim()), {
    message: 'Provide exactly one of parentAgentId or designatedAdminHakaId',
  });

export async function submitAgentApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const body = applyAsAgentSchema.parse(req.body);
    const result = await agentAppSvc.submitAgentApplication(
      req.user!.id,
      body.proposedName,
      body.country,
      body.parentAgentId ?? null,
      body.designatedAdminHakaId ?? null,
    );
    const message = 'autoApproved' in result && result.autoApproved
      ? 'You are now an agent'
      : 'Application submitted';
    created(res, result, message);
  } catch (err) { next(err); }
}

export async function getMyAgentApplication(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await agentAppSvc.getMyAgentApplication(req.user!.id));
  } catch (err) { next(err); }
}

const agentAppNoteSchema = z.object({
  note: z.string().max(500).optional().default(''),
});

export async function listPendingAgentApplications(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await agentAppSvc.listPendingAgentApplicationsForParent(req.user!.id));
  } catch (err) { next(err); }
}

export async function approveAgentApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const body = agentAppNoteSchema.parse(req.body ?? {});
    const result = await agentAppSvc.approveAgentApplicationByParent(
      req.user!.id, req.params.id, body.note,
    );
    ok(res, result, 'Application approved');
  } catch (err) { next(err); }
}

export async function rejectAgentApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const body = agentAppNoteSchema.parse(req.body ?? {});
    const result = await agentAppSvc.rejectAgentApplicationByParent(
      req.user!.id, req.params.id, body.note,
    );
    ok(res, result, 'Application rejected');
  } catch (err) { next(err); }
}

export async function listPendingHostApplications(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await hostAppSvc.listPendingHostApplicationsForAgent(req.user!.id));
  } catch (err) { next(err); }
}

export async function approveHostApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const body = agentAppNoteSchema.parse(req.body ?? {});
    const result = await hostAppSvc.approveHostApplicationByAgent(
      req.user!.id, req.params.id, body.note,
    );
    ok(res, result, 'Application approved');
  } catch (err) { next(err); }
}

export async function rejectHostApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const body = agentAppNoteSchema.parse(req.body ?? {});
    const result = await hostAppSvc.rejectHostApplicationByAgent(
      req.user!.id, req.params.id, body.note,
    );
    ok(res, result, 'Application rejected');
  } catch (err) { next(err); }
}

const subAgentInviteCreateSchema = z.object({
  targetUserIdOrHaka: z.string().min(1).max(200),
  proposedAgencyName: z.string().max(100).optional().default(''),
});

export async function createSubAgentInvitation(req: Request, res: Response, next: NextFunction) {
  try {
    const body = subAgentInviteCreateSchema.parse(req.body);
    const result = await subAgentInviteSvc.createSubAgentInvitation(
      req.user!.id, body.targetUserIdOrHaka, body.proposedAgencyName,
    );
    created(res, result, 'Invitation sent');
  } catch (err) { next(err); }
}

export async function acceptSubAgentInvitation(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await subAgentInviteSvc.acceptSubAgentInvitation(req.user!.id, req.params.id);
    ok(res, result, 'Invitation accepted');
  } catch (err) { next(err); }
}

export async function declineSubAgentInvitation(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await subAgentInviteSvc.declineSubAgentInvitation(req.user!.id, req.params.id);
    ok(res, result, 'Invitation declined');
  } catch (err) { next(err); }
}

export async function cancelSubAgentInvitation(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await subAgentInviteSvc.cancelSubAgentInvitation(req.user!.id, req.params.id);
    ok(res, result, 'Invitation cancelled');
  } catch (err) { next(err); }
}

export async function listPendingSubAgentInvitations(req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, await subAgentInviteSvc.listPendingSubAgentInvitationsForInviter(req.user!.id));
  } catch (err) { next(err); }
}

/** GET /api/v1/agency/learn-promotions */
export async function getLearnPromotions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    ok(res, await service.listLearnPromotions());
  } catch (err) {
    next(err);
  }
}

// ── Agency Search ─────────────────────────────────────────────────────────────

export async function searchAgencies(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const results = await service.searchAgencies(q);
    ok(res, results);
  } catch (err) {
    next(err);
  }
}

/** GET /api/v1/agency/designated-admins — curated Admin Haka IDs for Become Agency. */
export async function listDesignatedAdmins(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    ok(res, await listActiveDesignatedBecomeAgencyAdminsForMobile());
  } catch (err) {
    next(err);
  }
}

/** GET /api/v1/agency/bind-search — list active agencies for Become Agent (any authenticated user). */
export async function bindSearchAgencies(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const results = await service.bindSearchAgencies(q);
    ok(res, results);
  } catch (err) {
    next(err);
  }
}

/** GET /api/v1/agency/lookup-parent-agent — resolve one parent agent by Haka ID, UUID, or username. */
export async function lookupParentAgent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
    if (!q) {
      fail(res, 'Agent ID is required', 400);
      return;
    }
    const result = await service.lookupParentAgent(q);
    ok(res, result);
  } catch (err) {
    next(err);
  }
}
