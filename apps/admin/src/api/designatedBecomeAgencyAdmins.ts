import client from './client';

export interface DesignatedBecomeAgencyAdmin {
  id: string;
  adminId: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  admin: {
    id: string;
    displayName: string;
    hakaId: string | null;
    region: string | null;
    role: string;
    isActive: boolean;
  };
}

export function listDesignatedBecomeAgencyAdmins(): Promise<DesignatedBecomeAgencyAdmin[]> {
  return client.get('/designated-become-agency-admins');
}

export function createDesignatedBecomeAgencyAdmin(data: {
  adminId?: string;
  hakaId?: string;
  sortOrder?: number;
}): Promise<DesignatedBecomeAgencyAdmin> {
  return client.post('/designated-become-agency-admins', data);
}

export function updateDesignatedBecomeAgencyAdmin(
  id: string,
  data: { sortOrder?: number; isActive?: boolean },
): Promise<DesignatedBecomeAgencyAdmin> {
  return client.patch(`/designated-become-agency-admins/${id}`, data);
}

export function deleteDesignatedBecomeAgencyAdmin(id: string): Promise<void> {
  return client.delete(`/designated-become-agency-admins/${id}`);
}
