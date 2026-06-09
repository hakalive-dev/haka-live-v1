import adminClient from './client';

export interface AgentApplication {
  id: string;
  status: string;
  proposedName: string;
  country: string;
  note: string;
  designatedAdminId?: string | null;
  reviewedAt: string | null;
  createdAt: string;
  user: { id: string; displayName: string; username: string | null; avatar: string | null; hakaId: string | null };
  parentAgent: { id: string; displayName: string; username: string | null; hakaId: string | null } | null;
  designatedAdmin: { id: string; displayName: string; hakaId: string | null } | null;
}

export async function listApplications(status?: string): Promise<AgentApplication[]> {
  const params = status ? `?status=${status}` : '';
  return adminClient.get(`/agent-applications${params}`);
}

export async function approveApplication(id: string, note = ''): Promise<void> {
  await adminClient.post(`/agent-applications/${id}/approve`, { note });
}

export async function rejectApplication(id: string, note: string): Promise<void> {
  await adminClient.post(`/agent-applications/${id}/reject`, { note });
}
