import { apiClient } from './client';

export interface AgencyOwnerSnippet {
  displayName: string;
}

export interface AgencySnippet {
  id: string;
  name: string;
  owner: AgencyOwnerSnippet;
}

export interface InvitationDTO {
  id: string;
  fromAgency: AgencySnippet;
  toAgency: AgencySnippet;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  note: string;
  reviewedBy: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgencySearchResult {
  id: string;
  name: string;
  owner: { displayName: string; hakaId: string };
}

export const agencyInvitationsApi = {
  list(): Promise<{ sent: InvitationDTO[]; received: InvitationDTO[] }> {
    return apiClient.get('/agency/invitations').then(r => r.data);
  },

  create(toAgencyId: string, note: string): Promise<InvitationDTO> {
    return apiClient.post('/agency/invitations', { toAgencyId, note }).then(r => r.data);
  },

  cancel(id: string): Promise<InvitationDTO> {
    return apiClient.post(`/agency/invitations/${id}/cancel`).then(r => r.data);
  },

  searchAgencies(q: string): Promise<AgencySearchResult[]> {
    return apiClient.get(`/agency/search?q=${encodeURIComponent(q)}`).then(r => r.data);
  },
};
