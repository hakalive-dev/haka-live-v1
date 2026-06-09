/**
 * migrate-gift-assets.js — zero-dependency version
 * Uses Node.js built-in fetch + Supabase REST/Storage APIs directly.
 * Run: node prisma/migrate-gift-assets.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL  = process.env.DATABASE_URL;
const BUCKET        = 'admin-uploads';
const ASSETS_DIR    = path.resolve(__dirname, 'assets/gifts');

if (!SUPABASE_URL || !SERVICE_KEY || !DATABASE_URL) {
  console.error('❌  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and DATABASE_URL must be set.');
  process.exit(1);
}

// Extract Supabase project ref from URL (https://XXXX.supabase.co)
const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];

const GIFT_FILES = {
  'gifts/86.png':   { localFile: '86.png',   mimeType: 'image/png',                storageKey: 'gifts/86.png'   },
  'gifts/93.png':   { localFile: '93.png',   mimeType: 'image/png',                storageKey: 'gifts/93.png'   },
  'gifts/116.png':  { localFile: '116.png',  mimeType: 'image/png',                storageKey: 'gifts/116.png'  },
  'gifts/121.png':  { localFile: '121.png',  mimeType: 'image/png',                storageKey: 'gifts/121.png'  },
  'gifts/86.svga':  { localFile: '86.svga',  mimeType: 'application/octet-stream', storageKey: 'gifts/86.svga'  },
  'gifts/93.svga':  { localFile: '93.svga',  mimeType: 'application/octet-stream', storageKey: 'gifts/93.svga'  },
  'gifts/116.svga': { localFile: '116.svga', mimeType: 'application/octet-stream', storageKey: 'gifts/116.svga' },
  'gifts/121.svga': { localFile: '121.svga', mimeType: 'application/octet-stream', storageKey: 'gifts/121.svga' },
};

function getPublicUrl(storageKey) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storageKey}`;
}

async function uploadFile(storageKey, buffer, mimeType) {
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storageKey}`;
  // Try PUT (upsert) first
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': mimeType,
      'x-upsert': 'true',
    },
    body: buffer,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }
}

async function queryDB(sql, params = []) {
  // Use Supabase PostgREST-compatible approach via the pg connection string
  // Since we can't use pg directly, use Supabase's SQL execution endpoint
  const url = `${SUPABASE_URL}/rest/v1/rpc/exec_sql`;
  // Actually use the Supabase management API to run raw SQL
  // Better: use the PostgREST API to read/write the gifts table directly
  throw new Error('Use REST API instead');
}

async function getGifts() {
  const url = `${SUPABASE_URL}/rest/v1/gifts?select=id,name,image,svgaAsset`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch gifts: ${await res.text()}`);
  return res.json();
}

async function updateGift(id, patch) {
  const url = `${SUPABASE_URL}/rest/v1/gifts?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Failed to update gift ${id}: ${await res.text()}`);
}

async function main() {
  const urlMap = {};

  console.log('Uploading gift assets to Supabase storage...');
  for (const [relativePath, meta] of Object.entries(GIFT_FILES)) {
    const filePath = path.join(ASSETS_DIR, meta.localFile);
    if (!fs.existsSync(filePath)) {
      console.warn(`  ⚠️  File not found, skipping: ${filePath}`);
      continue;
    }

    const buffer = fs.readFileSync(filePath);
    try {
      await uploadFile(meta.storageKey, buffer, meta.mimeType);
      const publicUrl = getPublicUrl(meta.storageKey);
      urlMap[relativePath] = publicUrl;
      console.log(`  ✅  ${relativePath} → ${publicUrl}`);
    } catch (err) {
      console.error(`  ❌  ${meta.storageKey}: ${err.message}`);
    }
  }

  console.log('\nFetching Gift records from DB...');
  const gifts = await getGifts();
  console.log(`  Found ${gifts.length} gifts`);

  let updated = 0;
  for (const gift of gifts) {
    const patch = {};
    if (gift.image && urlMap[gift.image])           patch.image     = urlMap[gift.image];
    if (gift.svgaAsset && urlMap[gift.svgaAsset])   patch.svgaAsset = urlMap[gift.svgaAsset];

    if (Object.keys(patch).length > 0) {
      await updateGift(gift.id, patch);
      console.log(`  ✅  ${gift.name}: ${JSON.stringify(patch)}`);
      updated++;
    }
  }

  console.log(`\nDone. ${updated} gift(s) updated.`);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
