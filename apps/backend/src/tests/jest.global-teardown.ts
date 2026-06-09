import { prisma } from '../config/prisma';

export default async function globalTeardown(): Promise<void> {
  await prisma.$disconnect();
}
