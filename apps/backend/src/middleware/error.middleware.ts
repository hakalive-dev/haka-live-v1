import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  public status: number;
  constructor(
    public message: string,
    public statusCode: number = 400,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = statusCode;
  }
}

// Global error handler — must be registered last (4-arg signature).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      data: null,
      message: err.message,
    });
    return;
  }

  // Multer errors (e.g. LIMIT_FILE_SIZE from file size guard)
  if (err.name === 'MulterError') {
    const code = (err as unknown as { code?: string }).code;
    const msg = code === 'LIMIT_FILE_SIZE'
      ? 'File too large (max 5 MB)'
      : err.message;
    res.status(400).json({ success: false, data: null, message: msg });
    return;
  }

  // Unhandled Zod validation errors (e.g. from listSchema.parse in controllers)
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      data: null,
      message: 'Validation failed',
      errors: err.flatten().fieldErrors,
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    success: false,
    data: null,
    message: 'Internal server error',
  });
}
