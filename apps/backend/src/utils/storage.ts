import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { supabase } from '../config/supabase';
import { AppError } from '../middleware/error.middleware';

const DEFAULT_BUCKET = 'admin-uploads';

/** Directory for local file storage when Supabase is not configured. */
const LOCAL_UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export interface UploadOptions {
  /** Resize images before storing — only applies to image/* MIME types. */
  resize?: { maxDim: number; format: 'jpeg' | 'webp'; quality: number };
  /** Cache-Control max-age in seconds; appends ", immutable" when immutable=true. */
  cacheControl?: string;
  immutable?: boolean;
  /** Override the default max stored dimension (default 2048). Chat-bubble PNGs use 4096. */
  maxDim?: number;
}

const IMAGE_MIME_RE = /^image\//i;

/**
 * Largest dimension we will ever store for an uploaded image. Anything bigger
 * gets silently downscaled inside `uploadToStorage`, regardless of caller opts.
 * Picked to stay well under Android Canvas's bitmap limit (a 2048x2048 RGBA
 * decode is ~16 MB; the crash floor is ~100 MB).
 */
const HARD_CEILING_MAX_DIM = 2048;

async function maybeResizeImage(
  buffer: Buffer,
  mimeType: string,
  resize: NonNullable<UploadOptions['resize']>,
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (!IMAGE_MIME_RE.test(mimeType) || /gif|svg/i.test(mimeType)) {
    return { buffer, mimeType };
  }
  const pipeline = sharp(buffer)
    .rotate()
    .resize({ width: resize.maxDim, height: resize.maxDim, fit: 'inside', withoutEnlargement: true });
  const out =
    resize.format === 'webp'
      ? await pipeline.webp({ quality: resize.quality }).toBuffer()
      : await pipeline.jpeg({ quality: resize.quality, mozjpeg: true }).toBuffer();
  return { buffer: out, mimeType: resize.format === 'webp' ? 'image/webp' : 'image/jpeg' };
}

/**
 * Last-line-of-defense guard. Regardless of what the caller passed for
 * `opts.resize`, we never store an image with a dimension larger than
 * HARD_CEILING_MAX_DIM. Original format is preserved (PNG stays PNG with
 * transparency, JPEG stays JPEG, WebP stays WebP) to avoid surprising
 * downstream code that branches on MIME / extension.
 */
async function maybeApplyHardCeiling(
  buffer: Buffer,
  mimeType: string,
  maxDim: number = HARD_CEILING_MAX_DIM,
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (!IMAGE_MIME_RE.test(mimeType) || /gif|svg/i.test(mimeType)) {
    return { buffer, mimeType };
  }

  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(buffer).metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch {
    return { buffer, mimeType };
  }
  if (width === 0 || height === 0) return { buffer, mimeType };
  if (width <= maxDim && height <= maxDim) {
    return { buffer, mimeType };
  }

  const pipeline = sharp(buffer)
    .rotate()
    .resize({
      width: maxDim,
      height: maxDim,
      fit: 'inside',
      withoutEnlargement: true,
    });

  let out: Buffer;
  let outMime = mimeType;
  if (/png/i.test(mimeType)) {
    out = await pipeline.png({ compressionLevel: 6 }).toBuffer();
  } else if (/webp/i.test(mimeType)) {
    out = await pipeline.webp({ quality: 92 }).toBuffer();
  } else {
    out = await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    outMime = 'image/jpeg';
  }

  console.warn(
    `[storage] hard-ceiling triggered: ${width}x${height} -> max ${maxDim}px (mime=${mimeType})`,
  );
  return { buffer: out, mimeType: outMime };
}

function formatCacheControl(opts?: UploadOptions): string | undefined {
  if (!opts?.cacheControl) return undefined;
  return opts.immutable ? `${opts.cacheControl}, immutable` : opts.cacheControl;
}

/**
 * Upload a file buffer to storage.
 *
 * When Supabase is configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY),
 * files go to the specified bucket (defaults to "admin-uploads").
 *
 * Otherwise, files are saved to disk under ./uploads/ and served via the
 * /uploads static route (see app.ts). This allows image uploads to work
 * in local dev and Expo Go without any cloud dependency.
 */
export async function uploadToStorage(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  bucket: string = DEFAULT_BUCKET,
  requestBaseUrl?: string,
  opts?: UploadOptions,
): Promise<string> {
  let finalBuffer = buffer;
  let finalMime = mimeType;
  if (opts?.resize) {
    const processed = await maybeResizeImage(buffer, mimeType, opts.resize);
    finalBuffer = processed.buffer;
    finalMime = processed.mimeType;
  }
  // Safety net: even if no opts.resize was passed (or the caller picked a
  // generous maxDim), never persist an image larger than HARD_CEILING_MAX_DIM
  // on either axis. Prevents a giant CDN asset from force-closing the mobile
  // app the way an oversized bundled icon did on the Nepal withdrawal screen.
  const ceilinged = await maybeApplyHardCeiling(
    finalBuffer,
    finalMime,
    opts?.maxDim ?? HARD_CEILING_MAX_DIM,
  );
  finalBuffer = ceilinged.buffer;
  finalMime = ceilinged.mimeType;

  // ── Supabase path ────────────────────────────────────────────────────────
  if (supabase) {
    const cacheControl = formatCacheControl(opts);
    const { error } = await supabase.storage
      .from(bucket)
      .upload(filename, finalBuffer, {
        contentType: finalMime,
        upsert: true,
        ...(cacheControl ? { cacheControl } : {}),
      });

    if (error) throw new AppError(`Storage upload failed: ${error.message}`, 500);

    const { data } = supabase.storage.from(bucket).getPublicUrl(filename);
    return data.publicUrl;
  }

  // ── Local disk fallback ──────────────────────────────────────────────────
  const filePath = path.join(LOCAL_UPLOADS_DIR, filename);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, finalBuffer);

  // Use the caller-supplied base URL (derived from the incoming request's Host
  // header) so the URL is always reachable by the client that made the request,
  // regardless of what API_BASE_URL is set to in the environment.
  const port = process.env.PORT || 3000;
  const base = requestBaseUrl ?? process.env.API_BASE_URL ?? `http://localhost:${port}`;
  return `${base}/uploads/${filename}`;
}

function isUnreachableLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('172.')
    );
  } catch {
    return false;
  }
}

/**
 * Rewrite stored asset URLs so admin/mobile clients can load files served by this API
 * (e.g. local /uploads fallback saved with a device LAN host during upload).
 */
export function resolvePublicAssetUrl(storedUrl: string): string {
  if (!storedUrl?.trim()) return '';

  const apiBase = (process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT || 3000}`).replace(
    /\/$/,
    '',
  );

  if (storedUrl.startsWith('/uploads/')) {
    return `${apiBase}${storedUrl}`;
  }

  try {
    const parsed = new URL(storedUrl);
    if (parsed.pathname.startsWith('/uploads/') && isUnreachableLocalUrl(storedUrl)) {
      return `${apiBase}${parsed.pathname}`;
    }
  } catch {
    /* not a URL */
  }

  return storedUrl;
}

function guessMimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

export interface ParsedStorageRef {
  bucket?: string;
  /** Object key within bucket, or filename under ./uploads for local disk */
  objectKey: string;
}

/** Parse a stored screenshot/asset URL back into bucket + key (or local filename). */
export function parseStorageRef(storedUrl: string): ParsedStorageRef | null {
  const trimmed = storedUrl?.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('/uploads/')) {
    return { objectKey: trimmed.replace(/^\/uploads\//, '') };
  }

  try {
    const parsed = new URL(trimmed);
    const publicMatch = parsed.pathname.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
    if (publicMatch) {
      return {
        bucket: publicMatch[1],
        objectKey: decodeURIComponent(publicMatch[2]),
      };
    }
    if (parsed.pathname.startsWith('/uploads/')) {
      return { objectKey: parsed.pathname.replace(/^\/uploads\//, '') };
    }
  } catch {
    /* not a URL — treat as bare object key */
  }

  if (!trimmed.includes('://')) {
    return { objectKey: trimmed };
  }

  return null;
}

/** Read file bytes from Supabase or local uploads directory. */
export async function readAssetBuffer(
  storedUrl: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const ref = parseStorageRef(storedUrl);
  if (!ref) return null;

  if (supabase) {
    const bucketsToTry = ref.bucket
      ? [ref.bucket]
      : ['support-screenshots', 'admin-uploads', 'room-chat-images', 'dm-chat-images'];
    for (const bucket of bucketsToTry) {
      const { data, error } = await supabase.storage.from(bucket).download(ref.objectKey);
      if (!error && data) {
        const buffer = Buffer.from(await data.arrayBuffer());
        return { buffer, mimeType: guessMimeFromPath(ref.objectKey) };
      }
    }
  }

  const filePath = path.join(LOCAL_UPLOADS_DIR, ref.objectKey);
  if (!fs.existsSync(filePath)) return null;
  return {
    buffer: fs.readFileSync(filePath),
    mimeType: guessMimeFromPath(ref.objectKey),
  };
}

/** Signed URL for private Supabase buckets (admin/mobile img tags). */
export async function createSignedAssetUrl(storedUrl: string, expiresInSec = 3600): Promise<string> {
  if (!storedUrl?.trim()) return '';
  const ref = parseStorageRef(storedUrl);
  if (supabase && ref) {
    const buckets = ref.bucket
      ? [ref.bucket]
      : ['support-screenshots', 'admin-uploads', 'dm-chat-images', 'room-chat-images'];
    for (const bucket of buckets) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(ref.objectKey, expiresInSec);
      if (!error && data?.signedUrl) return data.signedUrl;
    }
  }
  return resolvePublicAssetUrl(storedUrl);
}
