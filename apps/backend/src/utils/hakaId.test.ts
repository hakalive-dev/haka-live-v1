/**
 * generateUniqueHakaId — Prisma is mocked; no database required for these unit tests.
 */
jest.mock('../config/prisma', () => {
  const user = { findUnique: jest.fn() };
  const adminUser = { findFirst: jest.fn() };
  const prismaMock = {
    user,
    adminUser,
    $transaction: jest.fn(),
  };
  return { prisma: prismaMock };
});

import { prisma } from '../config/prisma';
import { generateUniqueHakaId, HAKA_ID_SEQUENCE_START, PUBLIC_HAKA_ID_SEQUENCE_NAME } from './hakaId';

const mockTxUser = prisma.user as unknown as { findUnique: jest.Mock };
const mockTxAdminUser = prisma.adminUser as unknown as { findFirst: jest.Mock };

function defaultTransactionImpl(
  fn: (tx: {
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
    user: typeof prisma.user;
    adminUser: typeof prisma.adminUser;
  }) => Promise<string>,
) {
  return fn({
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([{ next_val: BigInt(500000001) }]),
    user: prisma.user,
    adminUser: prisma.adminUser,
  });
}

describe('generateUniqueHakaId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(defaultTransactionImpl);
    mockTxUser.findUnique.mockResolvedValue(null);
    mockTxAdminUser.findFirst.mockResolvedValue(null);
  });

  it('returns the first nextval when no user or admin has that hakaId', async () => {
    const id = await generateUniqueHakaId();

    expect(id).toBe(String(HAKA_ID_SEQUENCE_START));
    expect(mockTxUser.findUnique).toHaveBeenCalledWith({
      where: { hakaId: String(HAKA_ID_SEQUENCE_START) },
      select: { id: true },
    });
    expect(mockTxAdminUser.findFirst).toHaveBeenCalledWith({
      where: { hakaId: String(HAKA_ID_SEQUENCE_START) },
      select: { id: true },
    });
  });

  it('advances when candidate collides with an existing user row', async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(
      (fn: (tx: {
        $executeRaw: jest.Mock;
        $queryRaw: jest.Mock;
        user: typeof prisma.user;
        adminUser: typeof prisma.adminUser;
      }) => Promise<string>) => {
        const $queryRaw = jest
          .fn()
          .mockResolvedValueOnce([{ next_val: BigInt(500000001) }])
          .mockResolvedValueOnce([{ next_val: BigInt(500000002) }]);
        return fn({
          $executeRaw: jest.fn().mockResolvedValue(undefined),
          $queryRaw,
          user: prisma.user,
          adminUser: prisma.adminUser,
        });
      },
    );

    mockTxUser.findUnique
      .mockResolvedValueOnce({ id: 'existing' })
      .mockResolvedValueOnce(null);
    mockTxAdminUser.findFirst.mockResolvedValue(null);

    const id = await generateUniqueHakaId();

    expect(id).toBe('500000002');
    expect(mockTxUser.findUnique).toHaveBeenCalledTimes(2);
  });

  it('advances when candidate collides with an existing admin row', async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(
      (fn: (tx: {
        $executeRaw: jest.Mock;
        $queryRaw: jest.Mock;
        user: typeof prisma.user;
        adminUser: typeof prisma.adminUser;
      }) => Promise<string>) => {
        const $queryRaw = jest
          .fn()
          .mockResolvedValueOnce([{ next_val: BigInt(500000001) }])
          .mockResolvedValueOnce([{ next_val: BigInt(500000002) }]);
        return fn({
          $executeRaw: jest.fn().mockResolvedValue(undefined),
          $queryRaw,
          user: prisma.user,
          adminUser: prisma.adminUser,
        });
      },
    );

    mockTxUser.findUnique.mockResolvedValue(null);
    mockTxAdminUser.findFirst
      .mockResolvedValueOnce({ id: 'existing-admin' })
      .mockResolvedValueOnce(null);

    const id = await generateUniqueHakaId();

    expect(id).toBe('500000002');
    expect(mockTxAdminUser.findFirst).toHaveBeenCalledTimes(2);
  });

  it('exports sequence constant name for migrations/docs', () => {
    expect(PUBLIC_HAKA_ID_SEQUENCE_NAME).toBe('public_haka_id_seq');
  });
});
