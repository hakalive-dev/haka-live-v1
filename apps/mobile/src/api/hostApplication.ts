import { apiClient } from "./client";
import { useMock } from "./config";
import { mockHostApplication } from "./mock/hostApplication";
import type { HostApplication, PaginatedResult } from "../types";

export const hostApplicationApi = {
  /** User self-applies with no agent */
  async applyIndependent(): Promise<HostApplication> {
    if (useMock) return mockHostApplication.approvedIndependent;
    const res = await apiClient.post("/host-application/apply-independent");
    return res.data as HostApplication;
  },

  /** User self-applies with a specific agent (provide agent UUID) */
  async applyWithAgent(agentId: string): Promise<HostApplication> {
    if (useMock) return mockHostApplication.pendingWithAgent;
    const res = await apiClient.post("/host-application/apply-with-agent", {
      agentId,
    });
    return res.data as HostApplication;
  },

  /** Agent invites a user to become a host (`userId` = UUID, hakaId, or username). */
  async inviteUser(userId: string): Promise<HostApplication> {
    if (useMock) return mockHostApplication.agencyInvitation;
    const res = await apiClient.post("/host-application/invite", { userId });
    return res.data as HostApplication;
  },

  /** Invitee accepts an agency invitation */
  async acceptInvitation(id: string): Promise<HostApplication> {
    if (useMock) return { ...mockHostApplication.agencyInvitation, status: 'approved' };
    const res = await apiClient.post(`/host-application/${id}/accept`);
    return res.data as HostApplication;
  },

  /** Invitee declines an agency invitation */
  async declineInvitation(id: string): Promise<HostApplication> {
    if (useMock) return { ...mockHostApplication.agencyInvitation, status: 'rejected' };
    const res = await apiClient.post(`/host-application/${id}/decline`);
    return res.data as HostApplication;
  },

  /** Get caller's own latest application */
  async getMyStatus(): Promise<HostApplication | null> {
    if (useMock) return mockHostApplication.pending;
    const res = await apiClient.get("/host-application/me");
    return res.data as HostApplication;
  },

  /** Admin: list pending applications (via admin API) */
  async getPending(page = 1): Promise<PaginatedResult<HostApplication>> {
    if (useMock)
      return {
        items: [mockHostApplication.pending],
        total: 1,
        page: 1,
        limit: 20,
        hasMore: false,
      };
    const res = await apiClient.get(`/admin/host-applications?page=${page}`);
    return res.data as PaginatedResult<HostApplication>;
  },

  /** Admin: approve an application (via admin API) */
  async approve(id: string, note?: string): Promise<HostApplication> {
    const res = await apiClient.post(`/admin/host-applications/${id}/approve`, {
      note: note ?? "",
    });
    return res.data as HostApplication;
  },

  /** Admin: reject an application (via admin API) */
  async reject(id: string, note?: string): Promise<HostApplication> {
    const res = await apiClient.post(`/admin/host-applications/${id}/reject`, {
      note: note ?? "",
    });
    return res.data as HostApplication;
  },
};
