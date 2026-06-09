/**
 * One-time backfill: re-process pre-existing remote-uploaded images in
 * Supabase storage that exceed the 2048px hard ceiling enforced by
 * `maybeApplyHardCeiling` in src/utils/storage.ts.
 *
 * Why this exists:
 *   The live upload path now caps incoming images at 2048px on either axis.
 *   But anything uploaded *before* that change shipped is still sitting in
 *   storage at its original (possibly multi-thousand-pixel) dimensions and
 *   can crash the mobile Android Canvas the same way the bundled
 *   khalti.jpg (15113x7736 / 467 MB decoded) did on the Nepal withdrawal
 *   screen.
 *
 * Behavior:
 *   - Default: dry-run. Scans the 4 haka-live buckets, lists offenders,
 *     totals projected savings. Touches nothing in storage.
 *   - With `--apply`: same scan, then for each offender:
 *       1. Download bytes via the service-role Supabase client
 *       2. sharp().resize({ width: 2048, height: 2048, fit: 'inside',
 *          withoutEnlargement: true }) preserving original format
 *       3. Upsert back to the same key (URL unchanged -> every DB
 *          pointer keeps working untouched)
 *   - Per-file errors are skipped, logged, and counted. Run continues.
 *   - Naturally idempotent: a re-run after a partial/failed run skips
 *     anything already <= 2048px on both axes. No bookmark file needed.
 *
 * Required env (read directly from process.env, no full app boot):
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *
 * Run from apps/backend:
 *   npm run backfill:image-ceiling                # dry-run
 *   npm run backfill:image-ceiling -- --apply     # actually resize
 *
 * Writes a machine-readable JSON report to ./backfill-image-ceiling-report.json
 * in the cwd of the process for retro / audit.
 */

import fs from 'fs';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const HARD_CEILING_MAX_DIM = 2048;
const INTER_REQUEST_DELAY_MS = 50;
const LIST_PAGE_SIZE = 100;
const REPORT_FILENAME = 'backfill-image-ceiling-report.json';

const BUCKETS = [
  'admin-uploads',
  'room-chat-images',
  'dm-chat-images',
  'support-screenshots',
];

const IMAGE_MIME_RE = /^image\//i;

type PerFileOutcome =
  | { status: 'skipped_non_image'; bucket: string; key: string; reason: string }
  | { status: 'skipped_within_ceiling'; bucket: string; key: string; width: number; height: number }
  | { status: 'would_resize'; bucket: string; key: string; width: number; height: number; bytesIn: number }
  | { status: 'resized'; bucket: string; key: string; width: number; height: number; bytesIn: number; bytesOut: number }
  | { status: 'error'; bucket: string; key: string; reason: string };

interface BucketSummary {
  bucket: string;
  scanned: number;
  oversized: number;
  resized: number;
  skipped_non_image: number;
  errors: number;
  bytes_in: number;
  bytes_out: number;
}

function fail(msg: string): never {
  console.error(`\n[FAIL] ${msg}\n`);
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function inferMimeFromKey(key: string): string {
  const ext = path.extname(key).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function isSkippableMime(mime: string): boolean {
  if (!IMAGE_MIME_RE.test(mime)) return true;
  if (/gif|svg/i.test(mime)) return true;
  return false;
}

async function resizePreservingFormat(
  buffer: Buffer,
  mime: string,
): Promise<{ buffer: Buffer; mime: string }> {
  const pipeline = sharp(buffer)
    .rotate()
    .resize({
      width: HARD_CEILING_MAX_DIM,
      height: HARD_CEILING_MAX_DIM,
      fit: 'inside',
      withoutEnlargement: true,
    });

  if (/png/i.test(mime)) {
    return { buffer: await pipeline.png().toBuffer(), mime: 'image/png' };
  }
  if (/webp/i.test(mime)) {
    return { buffer: await pipeline.webp({ quality: 90 }).toBuffer(), mime: 'image/webp' };
  }
  return {
    buffer: await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer(),
    mime: 'image/jpeg',
  };
}

async function* listAllObjects(
  client: SupabaseClient,
  bucket: string,
  prefix = '',
): AsyncGenerator<{ name: string; mimetype?: string; size?: number }> {
  let offset = 0;
  while (true) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit: LIST_PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) return;

    for (const entry of data) {
      const isFolder = !entry.id && (entry as { metadata?: unknown }).metadata == null;
      const fullKey = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (isFolder) {
        yield* listAllObjects(client, bucket, fullKey);
      } else {
        yield {
          name: fullKey,
          mimetype: (entry as { metadata?: { mimetype?: string } }).metadata?.mimetype,
          size: (entry as { metadata?: { size?: number } }).metadata?.size,
        };
      }
    }

    if (data.length < LIST_PAGE_SIZE) return;
    offset += LIST_PAGE_SIZE;
  }
}

async function processObject(
  client: SupabaseClient,
  bucket: string,
  obj: { name: string; mimetype?: string; size?: number },
  apply: boolean,
): Promise<PerFileOutcome> {
  const key = obj.name;
  const mime = obj.mimetype || inferMimeFromKey(key);

  if (isSkippableMime(mime)) {
    return { status: 'skipped_non_image', bucket, key, reason: `mime=${mime}` };
  }

  // Download bytes (sharp needs the full file for reliable metadata across formats).
  const { data, error: dlError } = await client.storage.from(bucket).download(key);
  if (dlError || !data) {
    return { status: 'error', bucket, key, reason: `download failed: ${dlError?.message ?? 'no data'}` };
  }
  const inputBuffer = Buffer.from(await data.arrayBuffer());
  const bytesIn = inputBuffer.byteLength;

  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(inputBuffer).metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch (e) {
    return {
      status: 'error',
      bucket,
      key,
      reason: `sharp metadata failed: ${(e as Error).message}`,
    };
  }

  if (width === 0 || height === 0) {
    return { status: 'error', bucket, key, reason: `could not read dimensions` };
  }

  if (width <= HARD_CEILING_MAX_DIM && height <= HARD_CEILING_MAX_DIM) {
    return { status: 'skipped_within_ceiling', bucket, key, width, height };
  }

  if (!apply) {
    return { status: 'would_resize', bucket, key, width, height, bytesIn };
  }

  let resized: { buffer: Buffer; mime: string };
  try {
    resized = await resizePreservingFormat(inputBuffer, mime);
  } catch (e) {
    return { status: 'error', bucket, key, reason: `sharp resize failed: ${(e as Error).message}` };
  }

  const { error: upError } = await client.storage.from(bucket).upload(key, resized.buffer, {
    contentType: resized.mime,
    upsert: true,
  });
  if (upError) {
    return { status: 'error', bucket, key, reason: `upload failed: ${upError.message}` };
  }

  return {
    status: 'resized',
    bucket,
    key,
    width,
    height,
    bytesIn,
    bytesOut: resized.buffer.byteLength,
  };
}

async function processBucket(
  client: SupabaseClient,
  bucket: string,
  apply: boolean,
  outcomes: PerFileOutcome[],
): Promise<BucketSummary> {
  const sum: BucketSummary = {
    bucket,
    scanned: 0,
    oversized: 0,
    resized: 0,
    skipped_non_image: 0,
    errors: 0,
    bytes_in: 0,
    bytes_out: 0,
  };

  console.log(`\n[${bucket}] scanning...`);

  for await (const obj of listAllObjects(client, bucket)) {
    sum.scanned += 1;
    let outcome: PerFileOutcome;
    try {
      outcome = await processObject(client, bucket, obj, apply);
    } catch (e) {
      outcome = {
        status: 'error',
        bucket,
        key: obj.name,
        reason: `unhandled: ${(e as Error).message}`,
      };
    }
    outcomes.push(outcome);

    switch (outcome.status) {
      case 'skipped_non_image':
        sum.skipped_non_image += 1;
        break;
      case 'skipped_within_ceiling':
        break;
      case 'would_resize':
        sum.oversized += 1;
        sum.bytes_in += outcome.bytesIn;
        console.log(
          `  [DRY] ${bucket}/${outcome.key}  ${outcome.width}x${outcome.height}  ${fmtBytes(outcome.bytesIn)} -> would resize to <=${HARD_CEILING_MAX_DIM}px`,
        );
        break;
      case 'resized':
        sum.oversized += 1;
        sum.resized += 1;
        sum.bytes_in += outcome.bytesIn;
        sum.bytes_out += outcome.bytesOut;
        console.log(
          `  [OK ] ${bucket}/${outcome.key}  ${outcome.width}x${outcome.height}  ${fmtBytes(outcome.bytesIn)} -> ${fmtBytes(outcome.bytesOut)}`,
        );
        break;
      case 'error':
        sum.errors += 1;
        console.warn(`  [ERR] ${bucket}/${outcome.key}  ${outcome.reason}`);
        break;
    }

    if (INTER_REQUEST_DELAY_MS > 0) await sleep(INTER_REQUEST_DELAY_MS);
  }

  return sum;
}

async function main() {
  const apply = process.argv.includes('--apply');

  const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    fail(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Source your backend .env before running, or export the vars in your shell.',
    );
  }

  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log(
    `\nBackfill image ceiling (${HARD_CEILING_MAX_DIM}px). Mode: ${apply ? 'APPLY (will overwrite storage)' : 'DRY-RUN (no writes)'}`,
  );
  console.log(`Buckets: ${BUCKETS.join(', ')}`);

  const outcomes: PerFileOutcome[] = [];
  const summaries: BucketSummary[] = [];

  for (const bucket of BUCKETS) {
    try {
      const sum = await processBucket(client, bucket, apply, outcomes);
      summaries.push(sum);
    } catch (e) {
      console.error(`\n[FATAL bucket=${bucket}] ${(e as Error).message}`);
      summaries.push({
        bucket,
        scanned: 0,
        oversized: 0,
        resized: 0,
        skipped_non_image: 0,
        errors: 1,
        bytes_in: 0,
        bytes_out: 0,
      });
    }
  }

  // ── Summary table ──────────────────────────────────────────────────────
  console.log('\n=== Summary ===');
  console.log(
    'bucket'.padEnd(22) +
      'scanned'.padStart(9) +
      'oversize'.padStart(10) +
      'resized'.padStart(9) +
      'non-img'.padStart(9) +
      'errors'.padStart(8) +
      '   bytes_in -> bytes_out',
  );
  let totIn = 0;
  let totOut = 0;
  let totOversized = 0;
  let totErrors = 0;
  for (const s of summaries) {
    console.log(
      s.bucket.padEnd(22) +
        String(s.scanned).padStart(9) +
        String(s.oversized).padStart(10) +
        String(s.resized).padStart(9) +
        String(s.skipped_non_image).padStart(9) +
        String(s.errors).padStart(8) +
        `   ${fmtBytes(s.bytes_in)} -> ${fmtBytes(s.bytes_out)}`,
    );
    totIn += s.bytes_in;
    totOut += s.bytes_out;
    totOversized += s.oversized;
    totErrors += s.errors;
  }
  console.log(
    '-'.repeat(22) + ' '.repeat(45) + `   ${fmtBytes(totIn)} -> ${fmtBytes(totOut)}`,
  );

  if (!apply) {
    console.log(
      `\nDry-run complete. ${totOversized} object(s) exceed ${HARD_CEILING_MAX_DIM}px.`,
    );
    if (totOversized > 0) {
      console.log(`Re-run with --apply to actually resize.`);
    }
  } else {
    console.log(
      `\nApply complete. Resized ${totOversized - totErrors} of ${totOversized} offenders (${totErrors} errored — see report).`,
    );
    console.log(`Re-run without --apply to verify (should report 0 offenders).`);
  }

  // ── JSON report ────────────────────────────────────────────────────────
  const reportPath = path.resolve(process.cwd(), REPORT_FILENAME);
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        timestamp: new Date().toISOString(),
        ceiling_px: HARD_CEILING_MAX_DIM,
        summaries,
        outcomes,
      },
      null,
      2,
    ),
  );
  console.log(`\nReport written: ${reportPath}`);

  if (totErrors > 0) process.exit(2);
}

main().catch((e) => fail(`Unhandled: ${(e as Error).stack ?? e}`));
