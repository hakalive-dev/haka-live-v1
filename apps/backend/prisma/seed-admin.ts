import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { encryptPasswordSnapshot } from '../src/modules/accounts/password-snapshot';

const prisma = new PrismaClient();

function snapshotOrEmpty(plaintext: string): string {
  try {
    return encryptPasswordSnapshot(plaintext);
  } catch {
    return '';
  }
}

async function main() {
  const email = process.env.ADMIN_INITIAL_EMAIL || 'admin@hakalive.com';
  const password = process.env.ADMIN_INITIAL_PASSWORD || 'admin1234';
  const displayName = 'Super Admin';

  const existing = await prisma.adminUser.findUnique({ where: { email } });

  if (existing) {
    console.log(`Admin ${email} already exists — skipping`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.adminUser.create({
    data: {
      email,
      passwordHash,
      passwordSnapshot: snapshotOrEmpty(password),
      displayName,
      role: 'super_admin',
      roles: ['super_admin'],
    },
  });

  console.log(`Created super_admin: ${email}`);
}

main()
  .catch((e) => {
    console.error('Admin seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
