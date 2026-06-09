/**
 * migrate-gift-assets.ts
 *
 * One-time migration: upload bundled gift PNG + SVGA files to Supabase storage
 * and update the Gift records in the DB with full public URLs.
 *
 * Run from the backend directory:
 *   npx ts-node --project tsconfig.json prisma/migrate-gift-assets.ts
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your env (or .env file).
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'admin-uploads';
const ASSETS_DIR = path.resolve(__dirname, 'assets/gifts');

// Map: relative path stored in DB → local filename
const GIFT_FILES: Record<string, { localFile: string; mimeType: string; storageKey: string }> = {
  'gifts/86.png':    { localFile: '86.png',    mimeType: 'image/png',                storageKey: 'gifts/86.png'    },
  'gifts/93.png':    { localFile: '93.png',    mimeType: 'image/png',                storageKey: 'gifts/93.png'    },
  'gifts/116.png':   { localFile: '116.png',   mimeType: 'image/png',                storageKey: 'gifts/116.png'   },
  'gifts/121.png':   { localFile: '121.png',   mimeType: 'image/png',                storageKey: 'gifts/121.png'   },
  'gifts/86.svga':   { localFile: '86.svga',   mimeType: 'application/octet-stream', storageKey: 'gifts/86.svga'   },
  'gifts/93.svga':   { localFile: '93.svga',   mimeType: 'application/octet-stream', storageKey: 'gifts/93.svga'   },
  'gifts/116.svga':  { localFile: '116.svga',  mimeType: 'application/octet-stream', storageKey: 'gifts/116.svga'  },
  'gifts/121.svga':  { localFile: '121.svga',  mimeType: 'application/octet-stream', storageKey: 'gifts/121.svga'  },
};

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your environment.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const prisma = new PrismaClient();

  // Build a map of relative path → public Supabase URL
  const urlMap: Record<string, string> = {};

  console.log('Uploading gift assets to Supabase...');
  for (const [relativePath, meta] of Object.entries(GIFT_FILES)) {
    const filePath = path.join(ASSETS_DIR, meta.localFile);
    if (!fs.existsSync(filePath)) {
      console.warn(`  ⚠️  File not found, skipping: ${filePath}`);
      continue;
    }

    const buffer = fs.readFileSync(filePath);
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(meta.storageKey, buffer, { contentType: meta.mimeType, upsert: true });

    if (error) {
      console.error(`  ❌  Failed to upload ${meta.storageKey}: ${error.message}`);
      continue;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(meta.storageKey);
    urlMap[relativePath] = data.publicUrl;
    console.log(`  ✅  ${relativePath} → ${data.publicUrl}`);
  }

  // Update gift records that still have relative paths
  console.log('\nUpdating Gift records in DB...');
  const gifts = await prisma.gift.findMany();
  let updated = 0;

  for (const gift of gifts) {
    const patch: { image?: string; svgaAsset?: string } = {};

    if (gift.image && urlMap[gift.image]) {
      patch.image = urlMap[gift.image];
    }
    if (gift.svgaAsset && urlMap[gift.svgaAsset]) {
      patch.svgaAsset = urlMap[gift.svgaAsset];
    }

    if (Object.keys(patch).length > 0) {
      await prisma.gift.update({ where: { id: gift.id }, data: patch });
      console.log(`  ✅  ${gift.name}: ${JSON.stringify(patch)}`);
      updated++;
    }
  }

  console.log(`\nDone. ${updated} gift(s) updated.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
