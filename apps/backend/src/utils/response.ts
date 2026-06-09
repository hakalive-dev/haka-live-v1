import { Response } from 'express';

export function ok<T>(res: Response, data: T, message = '', statusCode = 200): Response {
  return res.status(statusCode).json({ success: true, data, message });
}

export function created<T>(res: Response, data: T, message = ''): Response {
  return ok(res, data, message, 201);
}

export function fail(res: Response, message: string, statusCode = 400, errors?: unknown): Response {
  return res.status(statusCode).json({ success: false, data: null, message, errors });
}
