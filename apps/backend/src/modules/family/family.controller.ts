import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as familyService from './family.service';
import { ok, created } from '../../utils/response';

const paginationSchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

const createSchema = z.object({
  name:         z.string().min(2).max(30),
  announcement: z.string().max(200).default(''),
});

const updateSchema = z.object({
  name:         z.string().min(2).max(30).optional(),
  announcement: z.string().max(200).optional(),
  badge:        z.string().optional(),
});

const memberSchema = z.object({
  userId: z.string().min(1),
});

/** GET /family */
export async function listFamilies(req: Request, res: Response, next: NextFunction) {
  try {
    const { page, limit, search } = paginationSchema.parse(req.query);
    const data = await familyService.listFamilies(page, limit, search);
    ok(res, data);
  } catch (err) { next(err); }
}

/** GET /family/me */
export async function getMyFamily(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await familyService.getMyFamily(req.user!.id);
    ok(res, data);
  } catch (err) { next(err); }
}

/** GET /family/:familyId */
export async function getFamily(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await familyService.getFamily(req.params.familyId);
    ok(res, data);
  } catch (err) { next(err); }
}

/** POST /family */
export async function createFamily(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, announcement } = createSchema.parse(req.body);
    const data = await familyService.createFamily(req.user!.id, name, announcement);
    created(res, data);
  } catch (err) { next(err); }
}

/** PATCH /family */
export async function updateFamily(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = updateSchema.parse(req.body);
    const data = await familyService.updateFamily(req.user!.id, parsed);
    ok(res, data);
  } catch (err) { next(err); }
}

/** POST /family/:familyId/join */
export async function joinFamily(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await familyService.joinFamily(req.user!.id, req.params.familyId);
    ok(res, data);
  } catch (err) { next(err); }
}

/** POST /family/leave */
export async function leaveFamily(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await familyService.leaveFamily(req.user!.id);
    ok(res, data);
  } catch (err) { next(err); }
}

/** DELETE /family */
export async function disbandFamily(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await familyService.disbandFamily(req.user!.id);
    ok(res, data);
  } catch (err) { next(err); }
}

/** POST /family/members/promote */
export async function promoteMember(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = memberSchema.parse(req.body);
    const data = await familyService.promoteMember(req.user!.id, userId);
    ok(res, data);
  } catch (err) { next(err); }
}

/** POST /family/members/kick */
export async function kickMember(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = memberSchema.parse(req.body);
    const data = await familyService.kickMember(req.user!.id, userId);
    ok(res, data);
  } catch (err) { next(err); }
}
