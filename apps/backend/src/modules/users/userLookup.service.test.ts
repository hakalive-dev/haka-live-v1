jest.mock("../../config/prisma", () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
    },
  },
}));

import { prisma } from "../../config/prisma";
import { resolveUserIdFromPublicIdentifier } from "./userLookup.service";

const mockFindFirst = prisma.user.findFirst as jest.Mock;

describe("resolveUserIdFromPublicIdentifier", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
  });

  it("returns null for blank input", async () => {
    expect(await resolveUserIdFromPublicIdentifier("  ")).toBeNull();
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("returns id from prisma", async () => {
    mockFindFirst.mockResolvedValue({ id: "user-1" });
    const id = await resolveUserIdFromPublicIdentifier("67485923");
    expect(id).toBe("user-1");
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { id: "67485923" },
          { hakaId: "67485923" },
          { username: { equals: "67485923", mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
  });
});
