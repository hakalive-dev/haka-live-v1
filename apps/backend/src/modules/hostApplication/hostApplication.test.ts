/**
 * Feature 13 — Host Application System
 * Tests: apply-independent, apply-with-agent, invite, approve, reject
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("../../config/firebase", () => ({
  firebaseAdmin: {
    auth: () => ({ verifyIdToken: jest.fn() }),
  },
}));

jest.mock("../../utils/jwt", () => {
  const actualJwt = jest.requireActual("../../utils/jwt");
  return {
    ...actualJwt,
    verifyAccessToken: jest.fn((token) => {
      const payload = JSON.parse(
        Buffer.from(token.split(".")[1], "base64").toString(),
      );
      return { ...payload, iat: Math.floor(Date.now() / 1000) };
    }),
  };
});

jest.mock("../../config/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    hostApplication: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    ban: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("../../sockets", () => ({
  getIO: jest.fn(() => ({
    to: jest.fn(() => ({ emit: jest.fn() })),
  })),
}));

jest.mock("../moderation/moderation.service", () => ({
  isUserBanned: jest.fn().mockResolvedValue(false),
  isDeviceBanned: jest.fn().mockResolvedValue(false),
}));

jest.mock("../moderation/revocation.service", () => ({
  isTokenRevoked: jest.fn().mockResolvedValue(false),
}));

jest.mock("../users/userLookup.service", () => ({
  resolveUserIdFromPublicIdentifier: jest
    .fn()
    .mockResolvedValue("00000000-0000-4000-8000-000000000002"),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../../app";
import { prisma } from "../../config/prisma";
import { resolveUserIdFromPublicIdentifier } from "../users/userLookup.service";
const mockResolveUser = resolveUserIdFromPublicIdentifier as jest.Mock;

// ── Typed mocks ───────────────────────────────────────────────────────────────

const mockUser = prisma.user as unknown as {
  findUnique: jest.Mock;
  findFirst: jest.Mock;
  update: jest.Mock;
};
const mockApp = prisma.hostApplication as unknown as {
  create: jest.Mock;
  findFirst: jest.Mock;
  findUnique: jest.Mock;
  findUniqueOrThrow: jest.Mock;
  findMany: jest.Mock;
  count: jest.Mock;
  update: jest.Mock;
};
const mockTransaction = prisma.$transaction as unknown as jest.Mock;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const JWT_SECRET = "test-jwt-access-secret-at-least-16";
const USER_ID = "00000000-0000-4000-8000-000000000001";
const AGENT_ID = "00000000-0000-4000-8000-000000000002";
const TARGET_ID = "00000000-0000-4000-8000-000000000003";
const APP_ID = "00000000-0000-4000-8000-000000000010";

function makeToken(userId = USER_ID, role = "normal_user") {
  return jwt.sign({ sub: userId, role }, JWT_SECRET, { expiresIn: "15m" });
}

const applicationFixture = {
  id: APP_ID,
  userId: USER_ID,
  agentId: null,
  path: "self_apply_independent",
  status: "pending",
  note: "",
  reviewedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  user: {
    id: USER_ID,
    username: "alice",
    displayName: "Alice",
    avatar: "",
    role: "normal_user",
    hostType: "",
  },
  agent: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUser.findUnique.mockReset();
  mockUser.findFirst.mockReset();
  mockApp.findFirst.mockReset();
  mockApp.create.mockReset();
  mockApp.findUnique.mockReset();
  mockApp.findMany.mockReset();
  mockApp.count.mockReset();
  mockApp.update.mockReset();
  mockApp.findUniqueOrThrow.mockReset();
  mockTransaction.mockReset();
  mockResolveUser.mockReset();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/v1/host-application/apply-independent", () => {
  it("instantly promotes user to host with an auto-approved independent application", async () => {
    mockUser.findUnique.mockResolvedValue({ role: "normal_user" });
    mockApp.findFirst.mockResolvedValue(null);

    const approvedRow = {
      ...applicationFixture,
      status: "approved" as const,
      note: "Auto-approved (independent)",
      reviewedAt: new Date().toISOString(),
      user: {
        ...applicationFixture.user,
        role: "host",
        hostType: "independent",
      },
    };

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          hostApplication: {
            create: jest.fn().mockResolvedValue({ id: APP_ID }),
            findUniqueOrThrow: jest.fn().mockResolvedValue(approvedRow),
          },
          user: { update: jest.fn().mockResolvedValue({}) },
        }),
    );

    const res = await request(app)
      .post("/api/v1/host-application/apply-independent")
      .set("Authorization", `Bearer ${makeToken()}`);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("You are now a host");
    expect(res.body.data.path).toBe("self_apply_independent");
    expect(res.body.data.status).toBe("approved");
  });

  it("rejects if user is already a host", async () => {
    mockUser.findUnique.mockResolvedValue({ role: "host" });

    const res = await request(app)
      .post("/api/v1/host-application/apply-independent")
      .set("Authorization", `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("already a host");
  });

  it("rejects if user already has a pending application", async () => {
    mockUser.findUnique.mockResolvedValue({ role: "normal_user" });
    mockApp.findFirst.mockResolvedValue({ id: "existing", status: "pending" });

    const res = await request(app)
      .post("/api/v1/host-application/apply-independent")
      .set("Authorization", `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("active host application");
  });

  it("returns 401 without token", async () => {
    const res = await request(app).post(
      "/api/v1/host-application/apply-independent",
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/host-application/apply-with-agent", () => {
  it("auto-approves and immediately promotes user to host under the agent", async () => {
    mockResolveUser.mockResolvedValue(AGENT_ID);
    // first call: applicant guard; second call: agent role check
    mockUser.findUnique
      .mockResolvedValueOnce({ role: "normal_user" })
      .mockResolvedValueOnce({ id: AGENT_ID, role: "agent", displayName: "Agent Bob" });
    mockApp.findFirst.mockResolvedValue(null);

    const approvedRow = {
      ...applicationFixture,
      agentId: AGENT_ID,
      path: "self_apply_with_agent",
      status: "approved",
      note: "Auto-approved (self-apply with agent)",
      reviewedAt: new Date().toISOString(),
      user: { ...applicationFixture.user, role: "host", hostType: "agent_host" },
      agent: { id: AGENT_ID, username: "agentbob", displayName: "Agent Bob", avatar: "" },
    };

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          hostApplication: {
            create: jest.fn().mockResolvedValue({ id: APP_ID }),
            findUniqueOrThrow: jest.fn().mockResolvedValue(approvedRow),
            update: jest.fn().mockResolvedValue(approvedRow),
          },
          user: { update: jest.fn().mockResolvedValue({}) },
        }),
    );

    const res = await request(app)
      .post("/api/v1/host-application/apply-with-agent")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({ agentId: AGENT_ID });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("approved");
    expect(res.body.data.path).toBe("self_apply_with_agent");
  });

  it("rejects if the specified user is not an agent", async () => {
    mockResolveUser.mockResolvedValue(AGENT_ID);
    // first call: applicant guard; second call: agent role check
    mockUser.findUnique
      .mockResolvedValueOnce({ role: "normal_user" })
      .mockResolvedValueOnce({ id: AGENT_ID, role: "normal_user", displayName: "Bob" });
    mockApp.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/host-application/apply-with-agent")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({ agentId: AGENT_ID });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/host-application/invite", () => {
  it("agent can invite a user by internal id", async () => {
    mockResolveUser.mockResolvedValue(TARGET_ID);
    mockUser.findUnique.mockImplementation(({ where }: any) => {
      if (where?.id === AGENT_ID)
        return Promise.resolve({ id: AGENT_ID, role: "agent" });
      if (where?.id === TARGET_ID)
        return Promise.resolve({ id: TARGET_ID, role: "normal_user" });
      return Promise.resolve(null);
    });
    mockApp.findFirst.mockResolvedValue(null);
    mockApp.create.mockResolvedValue({
      ...applicationFixture,
      userId: TARGET_ID,
      agentId: AGENT_ID,
      path: "agency_invitation",
    });

    const res = await request(app)
      .post("/api/v1/host-application/invite")
      .set("Authorization", `Bearer ${makeToken(AGENT_ID, "agent")}`)
      .send({ userId: TARGET_ID });

    expect(res.status).toBe(201);
    expect(res.body.data.path).toBe("agency_invitation");
  });

  it("agent can invite a user by public hakaId / username (resolved via lookup)", async () => {
    mockResolveUser.mockResolvedValue(TARGET_ID);
    mockUser.findUnique.mockImplementation(({ where }: any) => {
      if (where?.id === AGENT_ID)
        return Promise.resolve({ id: AGENT_ID, role: "agent" });
      if (where?.id === TARGET_ID)
        return Promise.resolve({ id: TARGET_ID, role: "normal_user" });
      return Promise.resolve(null);
    });
    mockApp.findFirst.mockResolvedValue(null);
    mockApp.create.mockResolvedValue({
      ...applicationFixture,
      userId: TARGET_ID,
      agentId: AGENT_ID,
      path: "agency_invitation",
    });

    const res = await request(app)
      .post("/api/v1/host-application/invite")
      .set("Authorization", `Bearer ${makeToken(AGENT_ID, "agent")}`)
      .send({ userId: "67485923" });

    expect(res.status).toBe(201);
    expect(res.body.data.path).toBe("agency_invitation");
  });

  it("rejects invite if caller is not an agent", async () => {
    mockUser.findUnique.mockResolvedValue({ id: USER_ID, role: "normal_user" });

    const res = await request(app)
      .post("/api/v1/host-application/invite")
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({ userId: TARGET_ID });

    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/host-application/me", () => {
  it("returns the user's latest application", async () => {
    mockApp.findFirst.mockResolvedValue(applicationFixture);

    const res = await request(app)
      .get("/api/v1/host-application/me")
      .set("Authorization", `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.path).toBe("self_apply_independent");
  });

  it("returns 404 if no application", async () => {
    mockApp.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/v1/host-application/me")
      .set("Authorization", `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/host-application/pending", () => {
  it("returns paginated pending applications", async () => {
    mockApp.findMany.mockResolvedValue([applicationFixture]);
    mockApp.count.mockResolvedValue(1);

    const res = await request(app)
      .get("/api/v1/host-application/pending")
      .set("Authorization", `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.total).toBe(1);
  });
});

describe("POST /api/v1/host-application/:id/approve", () => {
  it("approves a pending application and upgrades user to host", async () => {
    const fullApp = {
      ...applicationFixture,
      user: { id: USER_ID, role: "normal_user", agentId: null },
    };
    mockApp.findUnique.mockResolvedValue(fullApp);
    mockTransaction.mockImplementation(async (fn: Function) => {
      return fn({
        user: { update: jest.fn().mockResolvedValue({}) },
        hostApplication: {
          update: jest.fn().mockResolvedValue({
            ...applicationFixture,
            status: "approved",
            note: "Good application",
          }),
        },
      });
    });

    const res = await request(app)
      .post(`/api/v1/host-application/${APP_ID}/approve`)
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({ note: "Good application" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("approved");
  });

  it("returns 404 for non-existent application", async () => {
    mockApp.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/host-application/${APP_ID}/approve`)
      .set("Authorization", `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/host-application/:id/reject", () => {
  it("rejects a pending application", async () => {
    mockApp.findUnique.mockResolvedValue(applicationFixture);
    mockApp.update.mockResolvedValue({
      ...applicationFixture,
      status: "rejected",
      note: "Not eligible",
    });

    const res = await request(app)
      .post(`/api/v1/host-application/${APP_ID}/reject`)
      .set("Authorization", `Bearer ${makeToken()}`)
      .send({ note: "Not eligible" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("rejected");
  });

  it("rejects if application is already rejected", async () => {
    mockApp.findUnique.mockResolvedValue({
      ...applicationFixture,
      status: "rejected",
    });

    const res = await request(app)
      .post(`/api/v1/host-application/${APP_ID}/reject`)
      .set("Authorization", `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("already rejected");
  });
});

describe("POST /api/v1/host-application/:id/accept", () => {
  const invitationFixture = {
    ...applicationFixture,
    userId: USER_ID,
    agentId: AGENT_ID,
    path: "agency_invitation",
    status: "pending",
    user: { ...applicationFixture.user, agentId: null, role: "normal_user" },
  };

  it("promotes invitee to host when they accept", async () => {
    mockApp.findUnique.mockResolvedValue(invitationFixture);

    const approvedRow = {
      ...invitationFixture,
      status: "approved",
      note: "Accepted by invitee",
      reviewedAt: new Date().toISOString(),
    };

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          hostApplication: { update: jest.fn().mockResolvedValue(approvedRow) },
          user: { update: jest.fn().mockResolvedValue({}) },
        }),
    );

    const res = await request(app)
      .post(`/api/v1/host-application/${APP_ID}/accept`)
      .set("Authorization", `Bearer ${makeToken(USER_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("approved");
    expect(res.body.message).toContain("now a host");
  });

  it("returns 403 if a different user tries to accept", async () => {
    mockApp.findUnique.mockResolvedValue({
      ...invitationFixture,
      userId: "other-user-id",
    });

    const res = await request(app)
      .post(`/api/v1/host-application/${APP_ID}/accept`)
      .set("Authorization", `Bearer ${makeToken(USER_ID)}`);

    expect(res.status).toBe(403);
  });

  it("returns 400 if application is not agency_invitation path", async () => {
    mockApp.findUnique.mockResolvedValue({
      ...invitationFixture,
      path: "self_apply_with_agent",
    });

    const res = await request(app)
      .post(`/api/v1/host-application/${APP_ID}/accept`)
      .set("Authorization", `Bearer ${makeToken(USER_ID)}`);

    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/host-application/:id/decline", () => {
  const invitationFixture = {
    ...applicationFixture,
    userId: USER_ID,
    agentId: AGENT_ID,
    path: "agency_invitation",
    status: "pending",
  };

  it("sets status to rejected when invitee declines", async () => {
    mockApp.findUnique.mockResolvedValue(invitationFixture);

    const rejectedRow = {
      ...invitationFixture,
      status: "rejected",
      note: "Declined by invitee",
      reviewedAt: new Date().toISOString(),
    };

    mockApp.update.mockResolvedValue(rejectedRow);

    const res = await request(app)
      .post(`/api/v1/host-application/${APP_ID}/decline`)
      .set("Authorization", `Bearer ${makeToken(USER_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("rejected");
    expect(res.body.message).toBe("Invitation declined");
  });

  it("returns 403 if a different user tries to decline", async () => {
    mockApp.findUnique.mockResolvedValue({
      ...invitationFixture,
      userId: "other-user-id",
    });

    const res = await request(app)
      .post(`/api/v1/host-application/${APP_ID}/decline`)
      .set("Authorization", `Bearer ${makeToken(USER_ID)}`);

    expect(res.status).toBe(403);
  });
});
