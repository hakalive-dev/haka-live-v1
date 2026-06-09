import { prisma } from '../../../config/prisma';
import { AppError } from '../../../middleware/error.middleware';
import { hasBdRole, rolesOf, BD_TIER_ROLES } from '../../../shared-types/roles';
import { Period, agencyRevenueBeans } from '../metrics/staff-metrics';

function bucketEnd(period: Period, start: Date): Date {
  const e = new Date(start);
  if (period === 'month') e.setUTCMonth(e.getUTCMonth() + 1);
  else e.setUTCDate(e.getUTCDate() + 7);
  return e;
}

export async function upsertTarget(input: {
  staffId: string; period: Period; periodStart: string; revenueTarget: string; onboardTarget: number;
}) {
  const start = new Date(`${input.periodStart}T00:00:00.000Z`);
  return prisma.staffTarget.upsert({
    where: { staffId_period_periodStart: { staffId: input.staffId, period: input.period, periodStart: start } },
    create: {
      staffId: input.staffId, period: input.period, periodStart: start,
      revenueTarget: BigInt(input.revenueTarget), onboardTarget: input.onboardTarget,
    },
    update: { revenueTarget: BigInt(input.revenueTarget), onboardTarget: input.onboardTarget },
  });
}

async function actualFor(staffId: string, period: Period, start: Date) {
  const end = bucketEnd(period, start);
  const staff = await prisma.adminUser.findUnique({ where: { id: staffId } });
  if (!staff) throw new AppError('Staff not found', 404);

  let revenue = 0n; let onboard = 0;
  if (hasBdRole(rolesOf(staff))) {
    const agencies = await prisma.agency.findMany({ where: { bdId: staffId }, select: { id: true } });
    for (const a of agencies) revenue += await agencyRevenueBeans(a.id, start, end);
    onboard = await prisma.agency.count({ where: { bdId: staffId, createdAt: { gte: start, lt: end } } });
  } else {
    const bds = await prisma.adminUser.findMany({
      where: { managerId: staffId, roles: { hasSome: BD_TIER_ROLES } }, select: { id: true },
    });
    const bdIds = bds.map(b => b.id);
    const agencies = bdIds.length
      ? await prisma.agency.findMany({ where: { bdId: { in: bdIds } }, select: { id: true } }) : [];
    for (const a of agencies) revenue += await agencyRevenueBeans(a.id, start, end);
    onboard = await prisma.adminUser.count({
      where: { managerId: staffId, roles: { hasSome: BD_TIER_ROLES }, createdAt: { gte: start, lt: end } },
    });
  }
  return { revenue, onboard };
}

export async function getTargetWithActual(staffId: string, period: Period, periodStart: string) {
  const start = new Date(`${periodStart}T00:00:00.000Z`);
  const target = await prisma.staffTarget.findUnique({
    where: { staffId_period_periodStart: { staffId, period, periodStart: start } },
  });
  const { revenue, onboard } = await actualFor(staffId, period, start);
  const pct = (cur: bigint, tgt: bigint) =>
    (tgt === 0n ? null : Math.round((Number(cur) / Number(tgt)) * 1000) / 10);
  const revTgt = target?.revenueTarget ?? 0n;
  const onbTgt = target?.onboardTarget ?? 0;
  return {
    target: target
      ? { ...target, revenueTarget: target.revenueTarget.toString() }
      : { staffId, period, periodStart: start, revenueTarget: '0', onboardTarget: 0 },
    actual: { revenue: revenue.toString(), onboard },
    attainment: {
      revenuePct: pct(revenue, revTgt),
      onboardPct: onbTgt === 0 ? null : Math.round((onboard / onbTgt) * 1000) / 10,
    },
  };
}
