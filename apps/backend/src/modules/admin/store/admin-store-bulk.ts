import AdmZip from 'adm-zip';
import fs from 'fs';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { AppError } from '../../../middleware/error.middleware';
import { uploadToStorage } from '../../../utils/storage';
import * as storeService from './admin-store.service';

export const BULK_MAX_ROWS = 200;
export const BULK_MAX_ZIP_BYTES = 150 * 1024 * 1024;
export const BULK_CONCURRENCY = 6;

/** Must match in-app store categories (see store.service.ts). */
const STORE_CATEGORIES = [
  'frame',
  'entry',
  'chat_bubble',
  'special_id',
  'profile_card',
  'mic_voice_wave',
  'dynamic_profile',
  'ring',
  'theme',
] as const;

const manifestRowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(''),
  category: z.enum(STORE_CATEGORIES).optional().default('frame'),
  level: z.string().optional().default(''),
  coinCost: z.coerce.number().int().nonnegative().default(0),
  durationDays: z.coerce.number().int().nonnegative().default(0),
  sortOrder: z.coerce.number().int().optional().default(0),
  // For frames and other static items, imageFile is the primary asset (PNG/JPG/WEBP).
  imageFile: z.string().optional().transform((s) => (s?.trim() ? s.trim() : undefined)),
  // Optional SVGA animation. If present, it becomes the primary `image` (mobile playback).
  svgaFile: z.string().optional().transform((s) => (s?.trim() ? s.trim() : undefined)),
});

export type BulkImportFailedRow = { row: number; name?: string; error: string };
export type BulkImportResult = {
  created: Awaited<ReturnType<typeof storeService.createStoreItem>>[];
  failed: BulkImportFailedRow[];
};

/** Minimal 1×1 PNG for template ZIP. */
const TEMPLATE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64',
);

/** Minimal placeholder SVGA bytes for template ZIP. */
const TEMPLATE_SVGA = Buffer.from('<?xml version="1.0"?><svg></svg>', 'utf8');

const TEMPLATE_MANIFEST = `name,description,category,coinCost,durationDays,sortOrder,imageFile,svgaFile,level
Sample Frame,Static PNG frame,frame,100,0,0,sample.png,,
Sample Entry,Animated entry,entry,500,7,1,sample.png,sample.svga,
Sample Special ID,Tiered special ID,special_id,9999,30,2,,sample.svga,SSS
`;

export function buildBulkTemplateZip(): Buffer {
  const zip = new AdmZip();
  zip.addFile('manifest.csv', Buffer.from(TEMPLATE_MANIFEST, 'utf8'));
  zip.addFile('sample.png', TEMPLATE_PNG);
  zip.addFile('sample.svga', TEMPLATE_SVGA);
  return zip.toBuffer();
}

function normalizeZipKey(entryPath: string): string {
  return entryPath.replace(/\\/g, '/').replace(/^\/+/, '');
}

export function isSafeZipEntryPath(entryPath: string): boolean {
  const normalized = entryPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..')) return false;
  return true;
}

function findManifestKey(entries: AdmZip.IZipEntry[]): string | null {
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const key = normalizeZipKey(entry.entryName);
    if (!isSafeZipEntryPath(key)) continue;
    // Allow manifest.csv either at ZIP root or nested under a folder.
    // Many OS ZIP tools wrap selected files in a parent directory by default.
    if (key.toLowerCase() === 'manifest.csv' || key.toLowerCase().endsWith('/manifest.csv')) return key;
  }
  return null;
}

/** Parse CSV with quoted fields (commas and newlines inside quotes). */
export function parseManifestCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '') rows.push(row);

  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  const dataRows: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.every((c) => c.trim() === '')) continue;
    const record: Record<string, string> = {};
    headers.forEach((header, idx) => {
      if (header) record[header] = cells[idx] ?? '';
    });
    dataRows.push(record);
  }
  return dataRows;
}

function mimeForFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svga') return 'application/octet-stream';
  return 'application/octet-stream';
}

function buildFileMap(zip: AdmZip): Map<string, Buffer> {
  const map = new Map<string, Buffer>();
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const key = normalizeZipKey(entry.entryName);
    if (!isSafeZipEntryPath(key)) {
      throw new AppError(`Unsafe path in ZIP: ${entry.entryName}`, 400);
    }
    const baseName = key.includes('/') ? key.split('/').pop()! : key;
    map.set(key, entry.getData());
    if (!map.has(baseName)) map.set(baseName, entry.getData());
  }
  return map;
}

function resolveFile(fileMap: Map<string, Buffer>, filename: string | undefined): Buffer | undefined {
  if (!filename) return undefined;
  if (!isSafeZipEntryPath(filename)) {
    throw new AppError(`Unsafe asset path: ${filename}`, 400);
  }
  const normalized = normalizeZipKey(filename);
  if (fileMap.has(normalized)) return fileMap.get(normalized);
  const base = normalized.includes('/') ? normalized.split('/').pop()! : normalized;
  return fileMap.get(base);
}

async function uploadAsset(
  buffer: Buffer,
  filename: string,
  baseUrl?: string,
  category?: string,
): Promise<string> {
  const ext = filename.split('.').pop() || 'bin';
  const mime = mimeForFilename(filename);
  const storageName = `${uuid()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const isChatBubblePng =
    category === 'chat_bubble' && /\.(png|jpe?g|webp)$/i.test(filename);
  const opts = isChatBubblePng
    ? { maxDim: 4096, cacheControl: '31536000', immutable: true as const }
    : undefined;
  return uploadToStorage(
    buffer,
    storageName.endsWith(`.${ext}`) ? storageName : `${storageName}.${ext}`,
    mime,
    undefined,
    baseUrl,
    opts,
  );
}

export type ZipSource = Buffer | string;

function zipSizeBytes(source: ZipSource): number {
  return typeof source === 'string' ? fs.statSync(source).size : source.length;
}

export function extractZipEntries(zipSource: ZipSource): { manifestText: string; fileMap: Map<string, Buffer> } {
  const size = zipSizeBytes(zipSource);
  if (size > BULK_MAX_ZIP_BYTES) {
    throw new AppError(`ZIP file exceeds ${Math.floor(BULK_MAX_ZIP_BYTES / (1024 * 1024))} MB limit`, 400);
  }

  const zip = new AdmZip(zipSource as any);
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const key = normalizeZipKey(entry.entryName);
    if (!isSafeZipEntryPath(key)) {
      throw new AppError(`Unsafe path in ZIP: ${entry.entryName}`, 400);
    }
  }

  const manifestKey = findManifestKey(zip.getEntries());
  if (!manifestKey) throw new AppError('manifest.csv not found in ZIP (expected file named manifest.csv)', 400);

  const fileMap = buildFileMap(zip);
  const manifestBuf = fileMap.get(manifestKey);
  if (!manifestBuf || manifestBuf.length === 0) throw new AppError('manifest.csv is empty', 400);

  return { manifestText: manifestBuf.toString('utf8'), fileMap };
}

export async function bulkImportStoreItemsFromZip(
  adminId: string,
  zipSource: ZipSource,
  ipAddress?: string,
  baseUrl?: string,
): Promise<BulkImportResult> {
  const { manifestText, fileMap } = extractZipEntries(zipSource);
  const rawRows = parseManifestCsv(manifestText);

  if (rawRows.length === 0) throw new AppError('manifest.csv has no data rows', 400);
  if (rawRows.length > BULK_MAX_ROWS) throw new AppError(`manifest.csv exceeds maximum of ${BULK_MAX_ROWS} rows`, 400);

  const created: BulkImportResult['created'] = [];
  const failed: BulkImportFailedRow[] = [];

  let nextIdx = 0;
  const worker = async () => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const i = nextIdx++;
      if (i >= rawRows.length) return;

      const rowNumber = i + 2;
      const raw = rawRows[i];
      const nameHint = raw.name?.trim() || undefined;

      try {
        const parsed = manifestRowSchema.parse(raw);

        let image: string | undefined;
        let previewImage: string | undefined;

        // Static image (frames, etc.) → use as both primary image + preview.
        if (parsed.imageFile) {
          const buf = resolveFile(fileMap, parsed.imageFile);
          if (!buf) throw new AppError(`Image file not found in ZIP: ${parsed.imageFile}`, 400);
          const url = await uploadAsset(buf, parsed.imageFile, baseUrl, parsed.category);
          image = url;
          previewImage = url;
        }

        // Optional SVGA animation → becomes primary image; keep preview if we have one.
        if (parsed.svgaFile) {
          const buf = resolveFile(fileMap, parsed.svgaFile);
          if (!buf) throw new AppError(`SVGA file not found in ZIP: ${parsed.svgaFile}`, 400);
          image = await uploadAsset(buf, parsed.svgaFile, baseUrl, parsed.category);
        }

        const item = await storeService.createStoreItem(
          {
            name: parsed.name,
            description: parsed.description,
            category: parsed.category,
            level: parsed.level,
            coinCost: parsed.coinCost,
            durationDays: parsed.durationDays,
            sortOrder: parsed.sortOrder,
            image,
            previewImage,
          },
          adminId,
          ipAddress ?? '',
        );
        created.push(item);
      } catch (err) {
        const message =
          err instanceof z.ZodError
            ? err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
            : err instanceof Error
              ? err.message
              : 'Unknown error';
        failed.push({ row: rowNumber, name: nameHint, error: message });
      }
    }
  };

  const concurrency = Math.max(1, Math.min(BULK_CONCURRENCY, rawRows.length));
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { created, failed };
}

