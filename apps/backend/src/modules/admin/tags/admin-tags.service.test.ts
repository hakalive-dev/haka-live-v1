jest.mock('../../../config/prisma', () => {
  const prisma = {
    user: { findMany: jest.fn(), findUnique: jest.fn() },
    adminTag: { findUnique: jest.fn() },
    userTag: {
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: any) => fn(prisma));
  return { prisma };
});

jest.mock('../../../utils/audit', () => ({
  logAdminAction: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../moderation/revocation.service', () => ({
  forceLogout: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../../../config/prisma';
import { logAdminAction } from '../../../utils/audit';
import { forceLogout } from '../../moderation/revocation.service';
import { bulkAssignTags } from './admin-tags.service';

const mockPrisma = prisma as any;

describe('bulkAssignTags', () => {
  beforeEach(() => jest.clearAllMocks());

  it('assigns a tag to multiple users, logs each assignment, and does NOT force re-login (live profile refresh instead)', async () => {
    mockPrisma.adminTag.findUnique.mockResolvedValueOnce({ id: 'tag-1', name: 'moderator' });
    mockPrisma.user.findMany.mockResolvedValueOnce([{ id: 'user-1' }, { id: 'user-2' }]);
    mockPrisma.userTag.createMany.mockResolvedValueOnce({ count: 2 });
    mockPrisma.userTag.findMany.mockResolvedValueOnce([
      { id: 'ut-1', userId: 'user-1', tagId: 'tag-1', tag: { id: 'tag-1' } },
      { id: 'ut-2', userId: 'user-2', tagId: 'tag-1', tag: { id: 'tag-1' } },
    ]);

    const result = await bulkAssignTags('admin-1', ['user-1', 'user-2'], 'tag-1', '127.0.0.1');

    expect(mockPrisma.userTag.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 'user-1', tagId: 'tag-1', assignedBy: 'admin-1' },
        { userId: 'user-2', tagId: 'tag-1', assignedBy: 'admin-1' },
      ],
      skipDuplicates: true,
    });
    // Tag changes notify via `user:profile_updated` (notifyProfileUpdated)
    // instead of revoking sessions — see admin-tags.service.ts.
    expect(forceLogout).not.toHaveBeenCalled();
    expect(logAdminAction).toHaveBeenCalledTimes(2);
    expect(result.assignedCount).toBe(2);
  });

  it('rejects when any requested user does not exist', async () => {
    mockPrisma.adminTag.findUnique.mockResolvedValueOnce({ id: 'tag-1', name: 'moderator' });
    mockPrisma.user.findMany.mockResolvedValueOnce([{ id: 'user-1' }]);

    await expect(bulkAssignTags('admin-1', ['user-1', 'missing'], 'tag-1')).rejects.toMatchObject({
      message: expect.stringMatching(/not found/i),
      statusCode: 404,
    });
  });
});
