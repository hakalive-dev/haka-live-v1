import { PrismaClient } from '@prisma/client';
import { ROLE_PERMISSIONS } from '../src/shared-types';

const prisma = new PrismaClient();

const PNG_TAG_NAMES = new Set(['super_admin', 'admin', 'cs', 'bd', 'bdm']);

function tagIconUrl(name: string): string {
  const ext = PNG_TAG_NAMES.has(name) ? 'png' : 'svg';
  return `/tag-icons/${name}.${ext}`;
}

const BUILT_IN_TAGS = [
  { name: 'super_admin', displayName: 'Super Admin', color: '#F59E0B', sortOrder: 0 },
  { name: 'admin',       displayName: 'Admin',       color: '#7B4FFF', sortOrder: 1 },
  { name: 'cs',          displayName: 'CS',          color: '#8B5CF6', sortOrder: 2 },
  { name: 'moderator',   displayName: 'Moderator',   color: '#3B82F6', sortOrder: 3 },
  { name: 'assistant',   displayName: 'Assistant',   color: '#6B7280', sortOrder: 4 },
  { name: 'operator',    displayName: 'Operator',    color: '#10B981', sortOrder: 5 },
  { name: 'bd',          displayName: 'BD',          color: '#0EA5E9', sortOrder: 6 },
  { name: 'bdm',         displayName: 'BDM',         color: '#059669', sortOrder: 7 },
];

async function main() {
  console.log('Seeding admin tags...');
  for (const tag of BUILT_IN_TAGS) {
    await prisma.adminTag.upsert({
      where: { name: tag.name },
      update: {
        displayName: tag.displayName,
        color: tag.color,
        iconUrl: tagIconUrl(tag.name),
        permissions: ROLE_PERMISSIONS[tag.name] ?? [],
        isBuiltIn: true,
        sortOrder: tag.sortOrder,
      },
      create: {
        name: tag.name,
        displayName: tag.displayName,
        color: tag.color,
        iconUrl: tagIconUrl(tag.name),
        permissions: ROLE_PERMISSIONS[tag.name] ?? [],
        isBuiltIn: true,
        sortOrder: tag.sortOrder,
      },
    });
  }
  console.log(`Seeded ${BUILT_IN_TAGS.length} built-in admin tags.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
