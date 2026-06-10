import AdmZip from 'adm-zip';
import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../config/prisma';
import { resetDb, createTestUser, mintAdminJwt } from '../../../tests/db-helpers';
import {
  parseManifestCsv,
  extractZipEntries,
  bulkImportGiftsFromZip,
  buildBulkTemplateZip,
  isSafeZipEntryPath,
} from './admin-gifts-bulk';

jest.mock('../../../utils/storage', () => ({
  uploadToStorage: jest.fn(async (_buf: Buffer, filename: string) => `https://storage.test/${filename}`),
}));

function buildTestZip(files: Record<string, Buffer | string>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    zip.addFile(name, buf);
  }
  return zip.toBuffer();
}

const MINI_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64',
);

describe('admin-gifts-bulk — CSV parser', () => {
  it('parses quoted fields with commas', () => {
    const rows = parseManifestCsv('name,coinCost\n"Rose, deluxe",10');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Rose, deluxe');
    expect(rows[0].coinCost).toBe('10');
  });
});

describe('admin-gifts-bulk — ZIP safety', () => {
  it('rejects unsafe entry paths', () => {
    expect(isSafeZipEntryPath('../evil.png')).toBe(false);
    expect(isSafeZipEntryPath('foo/../../../etc/passwd')).toBe(false);
    expect(isSafeZipEntryPath('rose.png')).toBe(true);
  });

});

describe('admin-gifts-bulk — HTTP', () => {
  let adminToken = '';
  let adminId = '';

  beforeEach(async () => {
    await resetDb();
    const admin = await createTestUser();
    adminId = admin.id;
    adminToken = mintAdminJwt(admin.id, 'super_admin');
  });

  it('GET /api/v1/admin/gifts/bulk/template returns a zip', async () => {
    const res = await request(app)
      .get('/api/v1/admin/gifts/bulk/template')
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/zip/);
    const zipBuf = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body);
    const zip = new AdmZip(zipBuf);
    expect(zip.getEntry('manifest.csv')).toBeTruthy();
    expect(zip.getEntry('sample.png')).toBeTruthy();
  });

  it('POST /api/v1/admin/gifts/bulk creates gifts from manifest + assets', async () => {
    const suffix = Date.now();
    const roseName = `Bulk Rose ${suffix}`;
    const starName = `Bulk Star ${suffix}`;
    const manifest = `name,coinCost,beanValue,category,imageFile,svgaFile
${roseName},100,100,bag,rose.png,
${starName},200,200,hot,star.png,`;

    const zip = buildTestZip({
      'manifest.csv': manifest,
      'rose.png': MINI_PNG,
      'star.png': MINI_PNG,
    });

    const res = await request(app)
      .post('/api/v1/admin/gifts/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('zipFile', zip, 'gifts.zip');

    expect(res.status).toBe(200);
    expect(res.body.data.created).toHaveLength(2);
    expect(res.body.data.failed).toHaveLength(0);
    expect(res.body.data.created[0].image).toMatch(/^https:\/\/storage\.test\//);
    expect(res.body.data.created[1].image).toMatch(/^https:\/\/storage\.test\//);
  });

  it('partial success when image file is missing', async () => {
    const manifest = `name,coinCost,beanValue,imageFile
Good Gift,50,50,good.png
Bad Gift,60,60,missing.png`;

    const zip = buildTestZip({
      'manifest.csv': manifest,
      'good.png': MINI_PNG,
    });

    const res = await request(app)
      .post('/api/v1/admin/gifts/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('zipFile', zip, 'gifts.zip');

    expect(res.status).toBe(200);
    expect(res.body.data.created).toHaveLength(1);
    expect(res.body.data.created[0].name).toBe('Good Gift');
    expect(res.body.data.failed).toHaveLength(1);
    expect(res.body.data.failed[0].name).toBe('Bad Gift');
    expect(res.body.data.failed[0].error).toMatch(/not found/i);
  });

  it('fails row with invalid coinCost without creating that gift', async () => {
    const manifest = `name,coinCost,beanValue
Valid,10,10
Invalid,0,10`;

    const zip = buildTestZip({ 'manifest.csv': manifest });

    const res = await request(app)
      .post('/api/v1/admin/gifts/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('zipFile', zip, 'gifts.zip');

    expect(res.status).toBe(200);
    expect(res.body.data.created).toHaveLength(1);
    expect(res.body.data.failed).toHaveLength(1);
    expect(res.body.data.failed[0].name).toBe('Invalid');

    const invalid = await prisma.gift.findFirst({ where: { name: 'Invalid' } });
    expect(invalid).toBeNull();
  });

  it('returns 400 when manifest.csv is missing', async () => {
    const zip = buildTestZip({ 'only.png': MINI_PNG });
    const res = await request(app)
      .post('/api/v1/admin/gifts/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('zipFile', zip, 'gifts.zip');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/manifest/i);
  });
});

describe('admin-gifts-bulk — service', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('buildBulkTemplateZip is importable via bulkImportGiftsFromZip', async () => {
    const admin = await createTestUser();
    const zip = buildBulkTemplateZip();
    const result = await bulkImportGiftsFromZip(admin.id, zip);
    expect(result.created.length).toBeGreaterThanOrEqual(2);
    expect(result.failed).toHaveLength(0);
  });
});
