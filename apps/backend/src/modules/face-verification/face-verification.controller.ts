import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { ok, fail } from '../../utils/response';
import * as service from './face-verification.service';

const frameSchema = z.object({
  step: z.string().min(1),
  publicUrl: z.string().url(),
});

const uploadSignSchema = z.object({
  step: z.string().min(1),
  ext: z.enum(['jpg', 'jpeg', 'png', 'webp']).default('jpg'),
});

export async function getChallenges(_req: Request, res: Response, next: NextFunction) {
  try {
    ok(res, { challenges: service.getChallengeDefinitions() });
  } catch (err) {
    next(err);
  }
}

export async function getStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getUserFaceStatus(req.user!.id);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

export async function createSession(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.createSession(req.user!.id);
    ok(res, data, 'Session created');
  } catch (err) {
    next(err);
  }
}

export async function signFrameUpload(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = uploadSignSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors);
      return;
    }
    const data = await service.signFrameUpload(
      req.user!.id,
      req.params.sessionId,
      parsed.data.step,
      parsed.data.ext,
    );
    ok(res, data);
  } catch (err) {
    next(err);
  }
}

export async function registerFrame(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = frameSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      fail(res, 'Validation failed', 400, parsed.error.flatten().fieldErrors);
      return;
    }
    const data = await service.registerFrame(
      req.user!.id,
      req.params.sessionId,
      parsed.data.step,
      parsed.data.publicUrl,
    );
    ok(res, data, 'Frame registered');
  } catch (err) {
    next(err);
  }
}

export async function submitSession(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.submitSession(req.user!.id, req.params.sessionId);
    ok(res, data);
  } catch (err) {
    next(err);
  }
}
