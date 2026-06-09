import { v4 as uuid } from 'uuid';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { logAdminAction } from '../../../utils/audit';
import { uploadToStorage } from '../../../utils/storage';

export interface ThemeInput {
  name: string;
  gradientFrom?: string;
  gradientTo?: string;
  accentColor?: string;
  chatBubbleColor?: string;
  storeItemId?: string | null;
  coinCost?: number;
}

export interface ThemeFiles {
  backgroundImage?: Express.Multer.File;
  svga?: Express.Multer.File;
}

async function uploadThemeFiles(files: ThemeFiles): Promise<{ backgroundImageUrl?: string; svgaUrl?: string }> {
  const result: { backgroundImageUrl?: string; svgaUrl?: string } = {};

  if (files.backgroundImage) {
    const ext = files.backgroundImage.originalname.split('.').pop() || 'png';
    result.backgroundImageUrl = await uploadToStorage(
      files.backgroundImage.buffer,
      `themes/${uuid()}-background.${ext}`,
      files.backgroundImage.mimetype,
    );
  }

  if (files.svga) {
    const ext = files.svga.originalname.split('.').pop() || 'svga';
    result.svgaUrl = await uploadToStorage(
      files.svga.buffer,
      `themes/${uuid()}-animation.${ext}`,
      files.svga.mimetype,
    );
  }

  return result;
}

export async function listThemes() {
  return prisma.theme.findMany({
    orderBy: { createdAt: 'desc' },
    include: { storeItem: { select: { id: true, name: true, coinCost: true } } },
  });
}

export async function getTheme(id: string) {
  const theme = await prisma.theme.findUnique({ where: { id } });
  if (!theme) throw new AppError('Theme not found', 404);
  return theme;
}

async function resolveStoreItemId(
  coinCost: number | undefined,
  name: string,
  existingStoreItemId: string | null | undefined,
): Promise<string | null> {
  if (coinCost === undefined) return existingStoreItemId ?? null;

  if (coinCost <= 0) return null;

  if (existingStoreItemId) {
    await prisma.storeItem.update({
      where: { id: existingStoreItemId },
      data: { coinCost, name },
    });
    return existingStoreItemId;
  }

  const created = await prisma.storeItem.create({
    data: { name, category: 'theme', coinCost, durationDays: 0, isActive: true },
  });
  return created.id;
}

export async function createTheme(
  data: ThemeInput,
  files: ThemeFiles,
  adminId: string,
  ip: string,
) {
  const uploadedUrls = await uploadThemeFiles(files);

  const storeItemId = await resolveStoreItemId(data.coinCost, data.name, data.storeItemId);

  const theme = await prisma.theme.create({
    data: {
      name: data.name,
      ...(data.gradientFrom !== undefined ? { gradientFrom: data.gradientFrom } : {}),
      ...(data.gradientTo !== undefined ? { gradientTo: data.gradientTo } : {}),
      ...(data.accentColor !== undefined ? { accentColor: data.accentColor } : {}),
      ...(data.chatBubbleColor !== undefined ? { chatBubbleColor: data.chatBubbleColor } : {}),
      storeItemId,
      ...uploadedUrls,
    },
  });

  await logAdminAction(adminId, 'theme.create', 'Theme', theme.id, { name: theme.name }, ip);
  return theme;
}

export async function updateTheme(
  id: string,
  data: Partial<ThemeInput>,
  files: ThemeFiles,
  adminId: string,
  ip: string,
) {
  // Single findUnique to get existing URL values (needed to preserve them when no new file uploaded)
  const existing = await prisma.theme.findUnique({
    where: { id },
    select: { id: true, backgroundImageUrl: true, svgaUrl: true, storeItemId: true },
  });
  if (!existing) throw new AppError('Theme not found', 404);

  const uploadedUrls = await uploadThemeFiles(files);

  const resolvedStoreItemId = data.coinCost !== undefined
    ? await resolveStoreItemId(data.coinCost, data.name ?? '', existing.storeItemId)
    : ('storeItemId' in data ? data.storeItemId ?? null : existing.storeItemId);

  const theme = await prisma.theme.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.gradientFrom !== undefined ? { gradientFrom: data.gradientFrom } : {}),
      ...(data.gradientTo !== undefined ? { gradientTo: data.gradientTo } : {}),
      ...(data.accentColor !== undefined ? { accentColor: data.accentColor } : {}),
      ...(data.chatBubbleColor !== undefined ? { chatBubbleColor: data.chatBubbleColor } : {}),
      storeItemId: resolvedStoreItemId,
      // Only overwrite URL fields if a new file was uploaded; otherwise preserve existing
      backgroundImageUrl: uploadedUrls.backgroundImageUrl ?? existing.backgroundImageUrl,
      svgaUrl: uploadedUrls.svgaUrl ?? existing.svgaUrl,
    },
  });

  await logAdminAction(adminId, 'theme.update', 'Theme', id, { name: theme.name }, ip);
  return theme;
}

export async function deleteTheme(id: string, adminId: string, ip: string) {
  const existing = await prisma.theme.findUnique({ where: { id } });
  if (!existing) throw new AppError('Theme not found', 404);
  await prisma.theme.delete({ where: { id } });
  await logAdminAction(adminId, 'theme.delete', 'Theme', id, { name: existing.name }, ip);
}
