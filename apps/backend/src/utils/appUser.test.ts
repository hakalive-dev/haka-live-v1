import { prisma } from '../config/prisma';
import { resetDb } from '../tests/db-helpers';
import { resolveOrCreateAppUser } from './appUser';

describe('resolveOrCreateAppUser', () => {
  beforeEach(async () => { await resetDb(); });

  it('links an existing user when given their hakaId', async () => {
    const existing = await prisma.user.create({
      data: { displayName: 'Existing', hakaId: '500000123' },
    });
    const result = await resolveOrCreateAppUser({ mode: 'link', hakaId: '500000123' });
    expect(result.id).toBe(existing.id);
    expect(result.hakaId).toBe('500000123');
  });

  it('throws when linking a hakaId that does not exist', async () => {
    await expect(
      resolveOrCreateAppUser({ mode: 'link', hakaId: '500009999' }),
    ).rejects.toThrow(/not found/i);
  });

  it('creates a new user with a generated hakaId in create mode', async () => {
    const result = await resolveOrCreateAppUser({
      mode: 'create',
      displayName: 'New Owner',
      phone: '+15550001111',
      country: 'US',
    });
    expect(result.id).toBeTruthy();
    expect(result.hakaId).toMatch(/^\d{9}$/);
    expect(result.displayName).toBe('New Owner');
    const inDb = await prisma.user.findUnique({ where: { id: result.id } });
    expect(inDb?.phone).toBe('+15550001111');
  });

  it('rejects create mode when the phone is already taken', async () => {
    await prisma.user.create({ data: { displayName: 'X', phone: '+15550002222', hakaId: '500000200' } });
    await expect(
      resolveOrCreateAppUser({ mode: 'create', displayName: 'Dup', phone: '+15550002222' }),
    ).rejects.toThrow(/phone/i);
  });

  it('rejects create mode when the username is already taken', async () => {
    await prisma.user.create({ data: { displayName: 'Y', username: 'takenhandle', hakaId: '500000201' } });
    await expect(
      resolveOrCreateAppUser({ mode: 'create', displayName: 'Dup', username: 'takenhandle' }),
    ).rejects.toThrow(/username/i);
  });

  it('returns the linked user displayName', async () => {
    await prisma.user.create({ data: { displayName: 'Linked Name', hakaId: '500000202' } });
    const result = await resolveOrCreateAppUser({ mode: 'link', hakaId: '500000202' });
    expect(result.displayName).toBe('Linked Name');
  });
});
