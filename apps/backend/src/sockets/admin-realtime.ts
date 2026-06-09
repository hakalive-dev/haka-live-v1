import { getIO } from './index';

/** Broadcast to all connected admin panel sessions. */
export function emitToAdminStaff(event: string, payload: Record<string, unknown> = {}) {
  try {
    getIO().to('admin:staff').emit(event, payload);
  } catch {
    // Socket.io not initialised (e.g. tests)
  }
}

export function emitAdminDataChanged(resource: string, extra: Record<string, unknown> = {}) {
  emitToAdminStaff('admin:data_changed', { resource, ...extra });
}

/** Admin Management overview + BD Management lists (agency counts, revenue rollups). */
export function emitAdminManagementChanged(extra: Record<string, unknown> = {}) {
  emitAdminDataChanged('admin_management', extra);
  emitAdminDataChanged('bd_management', extra);
}
