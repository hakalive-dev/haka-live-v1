import client from './client';

export interface AgencySnippet {
  id: string;
  name: string;
  owner: { displayName: string };
}

export interface InvitationDTO {
  id: string;
  fromAgency: AgencySnippet;
  toAgency:   AgencySnippet;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  note: string;
  reviewedBy: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listInvitations(
  status?: string,
  cursor?: string,
): Promise<{ data: InvitationDTO[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (status && status !== 'all') params.set('status', status);
  if (cursor) params.set('cursor', cursor);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await client.get(`/invitations${qs}`);
  const payload = res as any;
  return { data: payload.rows, nextCursor: payload.nextCursor ?? null };
}

export async function approveInvitation(id: string): Promise<void> {
  await client.post(`/invitations/${id}/approve`);
}

export async function rejectInvitation(id: string, note: string): Promise<void> {
  await client.post(`/invitations/${id}/reject`, { note });
}
