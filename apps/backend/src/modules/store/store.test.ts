/**
 * Store module tests
 * Tests: GET /categories, GET /items, POST /purchase, GET /mine,
 *        POST /equip, POST /unequip,
 *        GET /special-ids, POST /special-ids/purchase,
 *        GET /special-ids/mine, POST /special-ids/activate,
 *        POST /special-ids/send, POST /special-ids/deactivate
 *
 * Prisma is mocked — no real database needed.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../config/firebase', () => ({
  firebaseAdmin: {
    auth: () => ({ verifyIdToken: jest.fn() }),
  },
}));

jest.mock('../../config/prisma', () => ({
  prisma: {
    storeItem: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    userStoreItem: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    wallet: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
    walletTransaction: {
      create: jest.fn().mockResolvedValue({}),
    },
    specialId: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    specialIdInventory: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    ban: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    accountRisk: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn(),
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';
import { prisma } from '../../config/prisma';

const JWT_SECRET = 'test-jwt-access-secret-at-least-16';
const USER_ID = 'user-store-1';

function makeToken(userId = USER_ID) {
  return jwt.sign({ sub: userId, role: 'normal_user' }, JWT_SECRET, { expiresIn: '15m' });
}

const mockStoreItem = prisma.storeItem as unknown as { findMany: jest.Mock; findUnique: jest.Mock };
const mockUserStoreItem = prisma.userStoreItem as unknown as {
  findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock;
  update: jest.Mock; updateMany: jest.Mock;
};
const mockWallet = prisma.wallet as unknown as { findUnique: jest.Mock; update: jest.Mock };
const mockSpecialId = prisma.specialId as unknown as { findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
const mockSpecialIdInv = prisma.specialIdInventory as unknown as {
  create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock;
};
const mockUser = prisma.user as unknown as { findUnique: jest.Mock; update: jest.Mock };
const mockTx = prisma as unknown as { $transaction: jest.Mock };

const fakeItem = {
  id: 'item-1',
  name: 'Golden Frame',
  description: 'A shiny frame',
  image: 'https://example.com/frame.png',
  previewImage: null,
  category: 'frame',
  level: 'common',
  coinCost: 100,
  durationDays: 30,
  sortOrder: 1,
  isActive: true,
};

const fakeUserItem = {
  id: 'uitem-1',
  userId: USER_ID,
  itemId: 'item-1',
  isEquipped: false,
  expiresAt: null,
  purchasedAt: new Date(),
  customHakaId: null,
  item: fakeItem,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/store/categories', () => {
  it('returns category list without auth', async () => {
    const res = await request(app).get('/api/v1/store/categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('key');
    expect(res.body.data[0]).toHaveProperty('label');
  });
});

describe('GET /api/v1/store/items', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/v1/store/items');
    expect(res.status).toBe(401);
  });

  it('returns all active store items', async () => {
    mockStoreItem.findMany.mockResolvedValue([fakeItem]);

    const res = await request(app)
      .get('/api/v1/store/items')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe('item-1');
    expect(res.body.data[0].coin_cost).toBe(100);
  });

  it('filters items by category', async () => {
    mockStoreItem.findMany.mockResolvedValue([fakeItem]);

    const res = await request(app)
      .get('/api/v1/store/items?category=frame')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(mockStoreItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { category: 'frame', isActive: true } }),
    );
  });
});

const fakeTx = {
  wallet: { update: jest.fn().mockResolvedValue({}) },
  walletTransaction: { create: jest.fn().mockResolvedValue({}) },
  userStoreItem: {
    create: jest.fn().mockResolvedValue({
      id: 'uitem-tx-1',
      userId: USER_ID,
      isEquipped: true,
      expiresAt: null,
      purchasedAt: new Date(),
      customHakaId: null,
      item: {
        id: 'item-1', name: 'Golden Frame', description: 'A shiny frame',
        image: null, previewImage: null, category: 'frame', level: 'common',
        coinCost: 100, durationDays: 30, sortOrder: 1,
      },
    }),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  specialId: { update: jest.fn().mockResolvedValue({}) },
  specialIdInventory: {
    create: jest.fn().mockResolvedValue({
      id: 'inv-new',
      specialId: { id: 'sid-1', number: 'HK001', level: 'gold' },
      pricePaid: 500,
    }),
    findFirst: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
  },
  user: { update: jest.fn().mockResolvedValue({}) },
};

describe('POST /api/v1/store/purchase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTx.$transaction.mockImplementation((fn: any) =>
      typeof fn === 'function' ? fn(fakeTx) : Promise.all(fn),
    );
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/v1/store/purchase').send({ itemId: 'item-1' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when itemId is missing', async () => {
    const res = await request(app)
      .post('/api/v1/store/purchase')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when item not found', async () => {
    mockStoreItem.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/store/purchase')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ itemId: 'nonexistent' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Item not found');
  });

  it('returns 400 for insufficient coins', async () => {
    mockStoreItem.findUnique.mockResolvedValue(fakeItem);
    mockWallet.findUnique.mockResolvedValue({ id: 'w1', userId: USER_ID, coinBalance: 10 });

    const res = await request(app)
      .post('/api/v1/store/purchase')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ itemId: 'item-1' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Insufficient coins');
  });

  it('purchases an item successfully and auto-equips wearable categories', async () => {
    mockStoreItem.findUnique.mockResolvedValue(fakeItem);
    mockWallet.findUnique.mockResolvedValue({ id: 'w1', userId: USER_ID, coinBalance: 500 });
    mockUserStoreItem.create.mockResolvedValue({ ...fakeUserItem, isEquipped: true });
    mockWallet.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/store/purchase')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ itemId: 'item-1' });

    expect(res.status).toBe(201);
    expect(res.body.data.item.id).toBe('item-1');
    expect(res.body.data.is_equipped).toBe(true);
    expect(fakeTx.userStoreItem.updateMany).toHaveBeenCalled();
    expect(fakeTx.userStoreItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isEquipped: true }),
      }),
    );
  });

  it('does not auto-equip theme purchases', async () => {
    const themeItem = { ...fakeItem, category: 'theme' };
    mockStoreItem.findUnique.mockResolvedValue(themeItem);
    mockWallet.findUnique.mockResolvedValue({ id: 'w1', userId: USER_ID, coinBalance: 500 });
    fakeTx.userStoreItem.create.mockResolvedValueOnce({
      ...fakeUserItem,
      isEquipped: false,
      item: themeItem,
    });

    const res = await request(app)
      .post('/api/v1/store/purchase')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ itemId: 'item-1' });

    expect(res.status).toBe(201);
    expect(res.body.data.is_equipped).toBe(false);
    expect(fakeTx.userStoreItem.updateMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/store/mine', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/v1/store/mine');
    expect(res.status).toBe(401);
  });

  it('returns user owned items', async () => {
    mockUserStoreItem.findMany.mockResolvedValue([fakeUserItem]);

    const res = await request(app)
      .get('/api/v1/store/mine')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe('uitem-1');
    expect(res.body.data[0].is_equipped).toBe(false);
  });
});

describe('POST /api/v1/store/equip', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/v1/store/equip').send({ userStoreItemId: 'uitem-1' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when userStoreItemId missing', async () => {
    const res = await request(app)
      .post('/api/v1/store/equip')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when item not found or not owned', async () => {
    mockUserStoreItem.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/store/equip')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ userStoreItemId: 'nonexistent' });

    expect(res.status).toBe(404);
  });

  it('equips an item', async () => {
    mockUserStoreItem.findUnique.mockResolvedValue(fakeUserItem);
    mockUserStoreItem.updateMany.mockResolvedValue({ count: 0 });
    mockUserStoreItem.update.mockResolvedValue({ ...fakeUserItem, isEquipped: true });

    const res = await request(app)
      .post('/api/v1/store/equip')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ userStoreItemId: 'uitem-1' });

    expect(res.status).toBe(200);
    expect(res.body.data.is_equipped).toBe(true);
  });
});

describe('POST /api/v1/store/unequip', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/v1/store/unequip').send({ userStoreItemId: 'uitem-1' });
    expect(res.status).toBe(401);
  });

  it('unequips an item', async () => {
    mockUserStoreItem.findUnique.mockResolvedValue({ ...fakeUserItem, isEquipped: true });
    mockUserStoreItem.update.mockResolvedValue({ ...fakeUserItem, isEquipped: false });

    const res = await request(app)
      .post('/api/v1/store/unequip')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ userStoreItemId: 'uitem-1' });

    expect(res.status).toBe(200);
    expect(res.body.data.is_equipped).toBe(false);
  });
});

describe('GET /api/v1/store/special-ids', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/v1/store/special-ids');
    expect(res.status).toBe(401);
  });

  it('returns available special IDs', async () => {
    mockSpecialId.findMany.mockResolvedValue([
      { id: 'sid-1', number: 'HK001', level: 'gold', price: 500, status: 'available' },
    ]);

    const res = await request(app)
      .get('/api/v1/store/special-ids')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].number).toBe('HK001');
  });
});

describe('GET /api/v1/store/special-ids/mine', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/v1/store/special-ids/mine');
    expect(res.status).toBe(401);
  });

  it('returns owned special IDs', async () => {
    mockSpecialIdInv.findMany.mockResolvedValue([
      {
        id: 'inv-1',
        userId: USER_ID,
        specialIdId: 'sid-1',
        status: 'inactive',
        pricePaid: 500,
        purchasedAt: new Date(),
        activatedAt: null,
        expiresAt: null,
        specialId: { id: 'sid-1', number: 'HK001', level: 'gold' },
      },
    ]);

    const res = await request(app)
      .get('/api/v1/store/special-ids/mine')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('POST /api/v1/store/special-ids/purchase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTx.$transaction.mockImplementation((fn: any) =>
      typeof fn === 'function' ? fn(fakeTx) : Promise.all(fn),
    );
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/v1/store/special-ids/purchase').send({ specialIdId: 'sid-1' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when specialIdId is missing', async () => {
    const res = await request(app)
      .post('/api/v1/store/special-ids/purchase')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when special ID not found', async () => {
    mockSpecialId.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/store/special-ids/purchase')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ specialIdId: 'nonexistent' });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/store/special-ids/activate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTx.$transaction.mockImplementation((fn: any) =>
      typeof fn === 'function' ? fn(fakeTx) : Promise.all(fn),
    );
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/v1/store/special-ids/activate').send({ inventoryId: 'inv-1' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when inventoryId is missing', async () => {
    const res = await request(app)
      .post('/api/v1/store/special-ids/activate')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when inventory not found', async () => {
    mockSpecialIdInv.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/store/special-ids/activate')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ inventoryId: 'nonexistent' });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/store/special-ids/deactivate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTx.$transaction.mockImplementation((fn: any) =>
      typeof fn === 'function' ? fn(fakeTx) : Promise.all(fn),
    );
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/v1/store/special-ids/deactivate');
    expect(res.status).toBe(401);
  });

  it('returns 400 when no active special ID', async () => {
    mockSpecialIdInv.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/store/special-ids/deactivate')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(400);
  });

  it('deactivates the active special ID', async () => {
    mockSpecialIdInv.findFirst.mockResolvedValue({
      id: 'inv-1',
      userId: USER_ID,
      status: 'active',
      specialId: { id: 'sid-1', number: 'HK001', level: 'gold' },
    });
    mockSpecialIdInv.update.mockResolvedValue({});
    mockUser.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/store/special-ids/deactivate')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
  });
});

describe('POST /api/v1/store/special-ids/send', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTx.$transaction.mockImplementation((fn: any) =>
      typeof fn === 'function' ? fn(fakeTx) : Promise.all(fn),
    );
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/v1/store/special-ids/send').send({ specialIdId: 'sid-1', recipientHakaId: 'HK999' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when specialIdId is missing', async () => {
    const res = await request(app)
      .post('/api/v1/store/special-ids/send')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ recipientHakaId: 'HK999' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when recipientHakaId is missing', async () => {
    const res = await request(app)
      .post('/api/v1/store/special-ids/send')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ specialIdId: 'sid-1' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when special ID not found', async () => {
    mockSpecialId.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/store/special-ids/send')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ specialIdId: 'nonexistent', recipientHakaId: 'HK999' });

    expect(res.status).toBe(404);
  });
});
