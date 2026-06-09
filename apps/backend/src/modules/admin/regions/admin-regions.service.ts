import { prisma } from '../../../config/prisma';

export async function listRegions() {
  const items = await prisma.region.findMany({ orderBy: { code: 'asc' } });
  return { items, total: items.length };
}

export async function createRegion(code: string, name: string) {
  return prisma.region.create({ data: { code, name } });
}

export async function updateRegion(code: string, data: { name?: string; isActive?: boolean }) {
  return prisma.region.update({ where: { code }, data });
}

export async function deleteRegion(code: string) {
  await prisma.region.delete({ where: { code } });
}
