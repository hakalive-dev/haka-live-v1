import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { ok } from '../../utils/response';

const PLACEMENT_REGEX = /^[a-z][a-z0-9_]*$/;

const querySchema = z.object({
  placement: z.string().min(1).max(64).regex(PLACEMENT_REGEX).optional(),
});

export async function listPublicBanners(req: Request, res: Response, next: NextFunction) {
  try {
    const { placement } = querySchema.parse(req.query);
    const now = new Date();
    const where: any = {
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now },
    };
    if (placement) where.placement = placement;

    const banners = await prisma.banner.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        imageUrl: true,
        title: true,
        subtitle: true,
        redirectType: true,
        redirectValue: true,
        placement: true,
        priority: true,
      },
    });

    ok(res, banners);
  } catch (err) {
    next(err);
  }
}
