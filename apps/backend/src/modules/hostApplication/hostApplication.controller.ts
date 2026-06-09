import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as service from "./hostApplication.service";
import { ok, created, fail } from "../../utils/response";

// ── Schemas ────────────────────────────────────────────────────────────────────

const applyWithAgentSchema = z.object({
  // Accept either a UUID (preferred) or a public-facing Haka ID / username.
  agentId: z.string().trim().min(1, "agentId is required").max(64),
});

const inviteSchema = z.object({
  /** Internal user id, hakaId, or username (same resolution as sub-agent invites). */
  userId: z.string().trim().min(1, "userId is required").max(64),
});

const reviewSchema = z.object({
  note: z.string().max(500).optional().default(""),
});

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ── Controllers ────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/host-application/apply-independent
 */
export async function applyIndependent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const application = await service.applyIndependent(req.user!.id);
    created(res, application, "You are now a host");
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/host-application/apply-with-agent
 * Body: { agentId }
 */
export async function applyWithAgent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = applyWithAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, "Validation failed", 400, parsed.error.flatten().fieldErrors);
      return;
    }
    const application = await service.applyWithAgent(
      req.user!.id,
      parsed.data.agentId,
    );
    created(res, application, "Application submitted");
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/host-application/invite
 * Body: { userId }
 * Agent only.
 */
export async function inviteHost(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, "Validation failed", 400, parsed.error.flatten().fieldErrors);
      return;
    }
    const application = await service.inviteHost(
      req.user!.id,
      parsed.data.userId,
    );
    created(res, application, "Invitation sent");
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/host-application/me
 */
export async function getMyApplication(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const application = await service.getMyApplication(req.user!.id);
    ok(res, application);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/host-application/pending?page=1&limit=20
 */
export async function getPendingApplications(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      fail(res, "Validation failed", 400, parsed.error.flatten().fieldErrors);
      return;
    }
    const result = await service.getPendingApplications(
      parsed.data.page,
      parsed.data.limit,
    );
    ok(res, result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/host-application/:id/approve
 * Body: { note? }
 */
export async function approveApplication(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, "Validation failed", 400, parsed.error.flatten().fieldErrors);
      return;
    }
    const application = await service.approve(req.params.id, parsed.data.note);
    ok(res, application, "Application approved");
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/host-application/:id/reject
 * Body: { note? }
 */
export async function rejectApplication(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, "Validation failed", 400, parsed.error.flatten().fieldErrors);
      return;
    }
    const application = await service.reject(req.params.id, parsed.data.note);
    ok(res, application, "Application rejected");
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/host-application/:id/accept
 * Invitee accepts their agency invitation.
 */
export async function acceptInvitation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const application = await service.acceptInvitation(req.user!.id, req.params.id);
    ok(res, application, "Invitation accepted — you are now a host");
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/host-application/:id/decline
 * Invitee declines their agency invitation.
 */
export async function declineInvitation(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const application = await service.declineInvitation(req.user!.id, req.params.id);
    ok(res, application, "Invitation declined");
  } catch (err) {
    next(err);
  }
}
