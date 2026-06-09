import { Request, Response, NextFunction } from 'express';
import { getMaintenance } from '../utils/maintenance';

/**
 * Global kill switch gate.
 *
 * When maintenance mode is active, every user-facing request gets a clean 503.
 * A small allow-list is ALWAYS let through so the switch is reversible:
 *   - /health, /            → uptime monitors / load balancer probes
 *   - /admin                → admin SPA (static)
 *   - /api/v1/admin/...     → admin API, so an operator can turn it back off
 *
 * The path check is intentionally prefix-based and runs before per-request DB
 * work, so an active switch sheds load immediately.
 */
function isAllowlisted(path: string): boolean {
  return (
    path === '/' ||
    path === '/health' ||
    path === '/admin' ||
    path.startsWith('/admin/') ||
    path.startsWith('/api/v1/admin')
  );
}

export async function maintenanceGate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (isAllowlisted(req.path)) {
    next();
    return;
  }

  const state = await getMaintenance();
  if (!state.active) {
    next();
    return;
  }

  res.setHeader('Retry-After', '120');
  res.status(503).json({
    success: false,
    data: { maintenance: true },
    message: state.message,
  });
}
