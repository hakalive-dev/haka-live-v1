import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';
import { PAYROLL_AGENT_ROLE } from '../admin/payments/admin-payments.service';
import { forceLogout } from '../moderation/revocation.service';
import { notifyUserPromotedToPayrollAgent } from './payroll-agent-notify.service';

/** Roles that keep their primary role when given a payroll profile (capability add-on). */
const ROLES_PRESERVED_WHEN_ADDING_PAYROLL = new Set(['agent', 'host']);

export function hasActivePayrollProfile(
  profile: { status: string } | null | undefined,
): boolean {
  return profile?.status === 'active';
}

function generatePayrollId(countryCode: string): string {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PAY-${countryCode}-${suffix}`;
}

export async function getProfileByUserId(userId: string) {
  return prisma.payrollAgentProfile.findUnique({ where: { userId } });
}

/** Resolve account by public Haka ID (not internal UUID). */
export async function resolveUserByHakaId(hakaId: string) {
  const normalized = hakaId.trim();
  if (!normalized) throw new AppError('Haka ID is required', 400);

  const user = await prisma.user.findUnique({ where: { hakaId: normalized } });
  if (!user) throw new AppError('No user found with this Haka ID', 404);
  return user;
}

export async function assertActivePayrollAgent(userId: string) {
  const profile = await getProfileByUserId(userId);
  if (!profile) throw new AppError('Payroll agent profile not found', 404);
  if (profile.status !== 'active') throw new AppError('Payroll agent account is not active', 403);
  return profile;
}

export async function listAgentsForCountry(countryCode?: string) {
  const where: { status: string; countryCode?: string } = { status: 'active' };
  if (countryCode) where.countryCode = countryCode.toUpperCase();

  const profiles = await prisma.payrollAgentProfile.findMany({
    where,
    include: {
      user: {
        select: { id: true, displayName: true, hakaId: true, username: true, isActive: true, role: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return profiles.filter((p) => p.status === 'active' && p.user.isActive);
}

export async function createPayrollAgentProfile(data: {
  userId: string;
  countryCode: string;
  commissionPercent?: number;
}) {
  let user = await prisma.user.findUnique({
    where: { id: data.userId },
    include: { coinSellerProfile: { select: { id: true } }, ownedAgency: { select: { id: true } } },
  });
  if (!user) throw new AppError('User not found', 404);

  // Heal accounts that lost `agent` when payroll was added before dual-role support.
  if (user.role === PAYROLL_AGENT_ROLE && (user.coinSellerProfile || user.ownedAgency)) {
    user = await prisma.user.update({
      where: { id: data.userId },
      data: { role: 'agent' },
      include: { coinSellerProfile: { select: { id: true } }, ownedAgency: { select: { id: true } } },
    });
  }

  const countryCode = data.countryCode.toUpperCase();
  const preservePrimaryRole = ROLES_PRESERVED_WHEN_ADDING_PAYROLL.has(user.role);
  const roleWillChange = !preservePrimaryRole && user.role !== PAYROLL_AGENT_ROLE;
  if (!preservePrimaryRole) {
    await prisma.user.update({
      where: { id: data.userId },
      data: { role: PAYROLL_AGENT_ROLE },
    });
  }

  const profile = await prisma.payrollAgentProfile.upsert({
    where: { userId: data.userId },
    create: {
      userId: data.userId,
      payrollId: generatePayrollId(countryCode),
      countryCode,
      commissionPercent: data.commissionPercent ?? 0,
      status: 'active',
      acceptingOrders: true,
    },
    update: {
      countryCode,
      commissionPercent: data.commissionPercent ?? undefined,
      status: 'active',
    },
  });

  if (roleWillChange) {
    await forceLogout(data.userId, 'role_payroll_agent').catch(() => {});
  }
  void notifyUserPromotedToPayrollAgent(
    data.userId,
    countryCode,
    profile.payrollId,
    preservePrimaryRole,
  ).catch(() => {});

  return profile;
}

export async function updatePayrollAgentProfile(
  userId: string,
  data: {
    status?: string;
    commissionPercent?: number;
    countryCode?: string;
    acceptingOrders?: boolean;
  },
) {
  const profile = await getProfileByUserId(userId);
  if (!profile) throw new AppError('Payroll agent profile not found', 404);

  const updated = await prisma.payrollAgentProfile.update({
    where: { userId },
    data: {
      status: data.status,
      commissionPercent: data.commissionPercent,
      countryCode: data.countryCode?.toUpperCase(),
      acceptingOrders: data.acceptingOrders,
    },
  });

  if (data.status && data.status !== 'active') {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (u?.role === PAYROLL_AGENT_ROLE) {
      await prisma.user.update({
        where: { id: userId },
        data: { role: 'normal_user' },
      });
      await forceLogout(userId, 'payroll_agent_removed').catch(() => {});
    }
  }

  return updated;
}
