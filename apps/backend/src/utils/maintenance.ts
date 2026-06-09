import { redis } from '../config/redis';

/**
 * Global maintenance ("kill switch") state, stored in Redis so a toggle takes
 * effect instantly across every API instance without a redeploy.
 *
 * When active, the maintenance gate (middleware/maintenance.middleware.ts)
 * returns 503 for all user-facing routes. The admin API and /health are always
 * allowed through so an operator can turn it back off.
 */

const KEY = 'haka:maintenance';

export interface MaintenanceState {
  active: boolean;
  /** Message shown to clients in the 503 envelope. */
  message: string;
  /** Internal note for the audit trail (not necessarily shown to clients). */
  reason: string;
  /** Admin user id that last flipped the switch. */
  by: string | null;
  /** ISO timestamp of the last change. */
  at: string | null;
}

const OFF: MaintenanceState = {
  active: false,
  message: '',
  reason: '',
  by: null,
  at: null,
};

const DEFAULT_MESSAGE =
  'Haka Live is temporarily down for maintenance. Please try again shortly.';

export async function getMaintenance(): Promise<MaintenanceState> {
  try {
    const raw = await redis.get(KEY);
    if (!raw) return { ...OFF };
    const parsed = JSON.parse(raw) as Partial<MaintenanceState>;
    return { ...OFF, ...parsed, active: Boolean(parsed.active) };
  } catch {
    // Fail OPEN: if Redis is unreachable we do NOT want to wedge the whole API
    // into a maintenance state we can't read or clear. Treat as "off".
    return { ...OFF };
  }
}

export async function enableMaintenance(opts: {
  by: string;
  message?: string;
  reason?: string;
}): Promise<MaintenanceState> {
  const state: MaintenanceState = {
    active: true,
    message: opts.message?.trim() || DEFAULT_MESSAGE,
    reason: opts.reason?.trim() || '',
    by: opts.by,
    at: new Date().toISOString(),
  };
  await redis.set(KEY, JSON.stringify(state));
  return state;
}

export async function disableMaintenance(by: string): Promise<MaintenanceState> {
  const state: MaintenanceState = { ...OFF, by, at: new Date().toISOString() };
  // Persist an explicit "off" record (rather than deleting) so the audit trail
  // keeps who turned it back on and when.
  await redis.set(KEY, JSON.stringify(state));
  return state;
}
