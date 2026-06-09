jest.mock('../config/prisma', () => {
  const prisma = {
    adminUser: { findUnique: jest.fn() },
    adminCustomRole: { findUnique: jest.fn() },
  };
  return { prisma };
});

jest.mock('../utils/response', () => ({
  fail: jest.fn((res: any, message: string, statusCode: number) => {
    res.status(statusCode).json({ success: false, message });
  }),
}));

import { prisma } from '../config/prisma';
import { requirePermission, resolveAdminPermissions } from './admin-auth.middleware';

const mockAdminUser = prisma.adminUser as unknown as { findUnique: jest.Mock };

function mockResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('requirePermission', () => {
  beforeEach(() => jest.clearAllMocks());

  it('allows a staff member when customPermissions include the required permission', async () => {
    mockAdminUser.findUnique.mockResolvedValueOnce({
      id: 'admin-1',
      role: 'cs',
      customPermissions: ['payment.manage'],
    });
    const req: any = { admin: { id: 'admin-1', role: 'cs' } };
    const res = mockResponse();
    const next = jest.fn();

    await requirePermission('payment.manage')(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.admin.permissions).toEqual(['payment.manage']);
  });

  it('denies a staff member when customPermissions are present but omit the required permission', async () => {
    mockAdminUser.findUnique.mockResolvedValueOnce({
      id: 'admin-1',
      role: 'admin',
      customPermissions: ['user.view'],
    });
    const req: any = { admin: { id: 'admin-1', role: 'admin' } };
    const res = mockResponse();
    const next = jest.fn();

    await requirePermission('payment.manage')(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('resolveAdminPermissions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses AdminUser.customPermissions as the effective permission set when present', async () => {
    mockAdminUser.findUnique.mockResolvedValueOnce({
      id: 'admin-1',
      role: 'admin',
      customPermissions: ['room.force_end'],
    });

    await expect(resolveAdminPermissions('admin', 'admin-1')).resolves.toEqual(['room.force_end']);
  });
});
