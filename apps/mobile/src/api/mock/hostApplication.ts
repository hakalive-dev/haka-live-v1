import type { HostApplication } from "@/types";

const user = {
  id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  username: "amara_live",
  displayName: "Amara Okafor",
  avatar: "https://i.pravatar.cc/150?u=amara_live",
};

const agent = {
  id: "f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c",
  username: "rosa_queen",
  displayName: "Rosa Martinez",
  avatar: "https://i.pravatar.cc/150?u=rosa_queen",
};

export const mockHostApplication = {
  pending: {
    id: "app-a1b2c3d4",
    userId: user.id,
    agentId: null,
    user,
    agent: null,
    path: "self_apply_independent",
    status: "pending",
    note: "I have been streaming on other platforms for 2 years and want to grow on Haka Live.",
    createdAt: "2026-03-28T09:00:00Z",
    updatedAt: "2026-03-28T09:00:00Z",
    reviewedAt: null,
  } as HostApplication,

  pendingWithAgent: {
    id: "app-b2c3d4e5",
    userId: user.id,
    agentId: agent.id,
    user,
    agent,
    path: "self_apply_with_agent",
    status: "pending",
    note: "Applying under Rosa Martinez's agency — she mentored me at the Haka meetup in Manila.",
    createdAt: "2026-03-28T09:00:00Z",
    updatedAt: "2026-03-28T09:00:00Z",
    reviewedAt: null,
  } as HostApplication,

  agencyInvitation: {
    id: "app-c3d4e5f6",
    userId: user.id,
    agentId: agent.id,
    user,
    agent,
    path: "agency_invitation",
    status: "pending",
    note: "Rosa invited me after seeing my 300+ listener stream.",
    createdAt: "2026-03-27T15:30:00Z",
    updatedAt: "2026-03-27T15:30:00Z",
    reviewedAt: null,
  } as HostApplication,

  approved: {
    id: "app-d4e5f6a7",
    userId: user.id,
    agentId: null,
    user,
    agent: null,
    path: "self_apply_independent",
    status: "approved",
    note: "",
    createdAt: "2026-03-20T10:00:00Z",
    updatedAt: "2026-03-22T14:30:00Z",
    reviewedAt: "2026-03-22T14:30:00Z",
  } as HostApplication,

  /** Instant independent host (matches production apply-independent response). */
  approvedIndependent: {
    id: "app-instant-01",
    userId: user.id,
    agentId: null,
    user: { ...user, role: "host", hostType: "independent" },
    agent: null,
    path: "self_apply_independent",
    status: "approved",
    note: "Auto-approved (independent)",
    createdAt: "2026-03-28T10:00:00Z",
    updatedAt: "2026-03-28T10:00:00Z",
    reviewedAt: "2026-03-28T10:00:00Z",
  } as HostApplication,
};
