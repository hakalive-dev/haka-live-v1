import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../../../config/prisma";
import { AppError } from "../../../middleware/error.middleware";
import { logAdminAction } from "../../../utils/audit";
import { creditBeans, debitBeans } from "../../wallet/wallet.service";
import {
  creditUser as masterCreditUser,
  deductUser as masterDeductUser,
} from "../master-wallet/master-wallet.service";
import { forceLogout } from "../../moderation/revocation.service";
import { supabase } from "../../../config/supabase";
import { vacateUserFromRoomSeats } from "../rooms/admin-rooms.service";
import { getIO } from "../../../sockets";
import { resolveTier } from "../../gifts/tier-lookup";
import { resolveGiftBonusTier } from "../../gifts/gift-bonus-tier-lookup";
import { resolveGiftBonusRateFromSetting } from "../../gifts/gift-bonus-rate";
import { XP_THRESHOLDS, CHARM_XP_THRESHOLDS, MAX_LEVEL } from "../../levels/levels.service";
import {
  COMMISSION_ROLLING_DAYS,
  GIFT_BONUS_ROLLING_DAYS,
  sumRollingAgencyHostIncome,
  sumRollingAgencyTurnoverCoins,
} from "../../gifts/rolling-agency-income";
import {
  isCommissionOverrideActiveAt,
  isGiftBonusOverrideActiveAt,
} from "../../gifts/agency-override-validity";
import {
  buildLoginPasswordDisplay,
  encryptPasswordSnapshot,
} from "../../accounts/password-snapshot";
import { redis } from "../../../config/redis";

export interface ListUsersParams {
  page: number;
  limit: number;
  search?: string;
  role?: string;
  hostType?: string;
  isActive?: boolean;
  isMuted?: boolean;
  country?: string;
  gender?: string;
  sort?: string;
  order?: "asc" | "desc";
}

// ── Service methods ────────────────────────────────────────────────────────────

export async function listUsers(params: ListUsersParams) {
  const {
    page,
    limit,
    search,
    role,
    hostType,
    isActive,
    isMuted,
    country,
    gender,
    sort = "createdAt",
    order = "desc",
  } = params;
  const skip = (page - 1) * limit;

  const where: Prisma.UserWhereInput = {};

  if (search) {
    where.OR = [
      { displayName: { contains: search, mode: "insensitive" } },
      { username: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { hakaId: { contains: search, mode: "insensitive" } },
      { activeSpecialId: { contains: search, mode: "insensitive" } },
    ];
  }

  if (role) where.role = role;
  if (hostType) where.hostType = hostType;
  if (isActive !== undefined) where.isActive = isActive;
  if (isMuted !== undefined) where.isMuted = isMuted;
  if (country) where.country = { contains: country, mode: "insensitive" };
  if (gender === "male" || gender === "female") where.gender = gender;

  // Sort by coin balance or rich level requires special ordering
  const orderByClause: Prisma.UserOrderByWithRelationInput =
    sort === "coinBalance"
      ? { wallet: { coinBalance: order } }
      : sort === "richLevel"
        ? { level: { richLevel: order } }
        : { [sort]: order };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: orderByClause,
      select: {
        id: true,
        displayName: true,
        username: true,
        phone: true,
        email: true,
        hakaId: true,
        avatar: true,
        facePhotoUrl: true,
        faceVerificationStatus: true,
        role: true,
        hostType: true,
        hostApplicationPath: true,
        agentId: true,
        isActive: true,
        isMuted: true,
        onboardingComplete: true,
        country: true,
        gender: true,
        state: true,
        city: true,
        createdAt: true,
        updatedAt: true,
        wallet: { select: { coinBalance: true, beanBalance: true } },
        level: { select: { richLevel: true, charmLevel: true } },
        tags: {
          select: {
            tagId: true,
            tag: {
              select: {
                id: true,
                displayName: true,
                color: true,
                iconUrl: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: users.map((user) => {
      const { tags, avatar, facePhotoUrl, ...rest } = user;
      return {
        ...rest,
        avatar,
        avatarUrl: avatar,
        facePhotoUrl: facePhotoUrl || avatar,
        userTags: tags,
      };
    }),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getUserDetail(userId: string, options?: { canViewPassword?: boolean }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      username: true,
      phone: true,
      email: true,
      country: true,
      city: true,
      gender: true,
      dateOfBirth: true,
      lastSeenAt: true,
      bio: true,
      hakaId: true,
      avatar: true,
      isActive: true,
      isMuted: true,
      isVerified: true,
      isVerifiedHost: true,
      isPremiumHost: true,
      cumulativeBeansEarned: true,
      role: true,
      hostType: true,
      agentId: true,
      onboardingComplete: true,
      createdAt: true,
      updatedAt: true,
      password: true,
      passwordSnapshot: true,
      faceVerificationStatus: true,
      faceVerifiedAt: true,
      settings: { select: { superAdminPower: true } },
      wallet: { select: { coinBalance: true, beanBalance: true } },
      level: { select: { richLevel: true, charmLevel: true } },
      activeSpecialId: true,
      activeSpecialIdLevel: true,
      activeSpecialIdExpiresAt: true,
      agent: {
        select: {
          id: true,
          displayName: true,
          hakaId: true,
          ownedAgency: {
            select: {
              id: true,
              name: true,
              status: true,
              bdId: true,
              bd: { select: { id: true, displayName: true, hakaId: true, managerId: true } },
            },
          },
        },
      },
      receivedInvite: {
        select: {
          id: true,
          code: true,
          inviter: { select: { id: true, displayName: true, hakaId: true } },
        },
      },
      ownedAgency: {
        select: {
          id: true,
          name: true,
          status: true,
          parentAgencyId: true,
          ownerId: true,
          createdAt: true,
          commissionRateOverride: true,
          commissionRateOverrideValidUntil: true,
          giftBonusRateOverride: true,
          giftBonusRateOverrideValidUntil: true,
          giftBonusEnabled: true,
          parentAgency: { select: { id: true, name: true } },
        },
      },
      hosts: {
        select: { id: true, displayName: true, hakaId: true, role: true },
      },
      hostedRooms: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          status: true,
          micConfig: true,
          viewerCount: true,
          createdAt: true,
        },
      },
      giftsSent: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          coinCost: true,
          createdAt: true,
          gift: { select: { name: true, icon: true } },
          recipient: { select: { displayName: true } },
        },
      },
      giftsReceived: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          beanValue: true,
          createdAt: true,
          gift: { select: { name: true, icon: true } },
          sender: { select: { displayName: true } },
        },
      },
      _count: {
        select: {
          following: true,
          followedBy: true,
          hostedRooms: true,
          giftsSent: true,
          giftsReceived: true,
        },
      },
    },
  });

  if (!user) throw new AppError("User not found", 404);

  if (user.role === "agent" && user.ownedAgency) {
    const oa = user.ownedAgency;
    const now = new Date();
    const rollingTurnoverCoins = await sumRollingAgencyTurnoverCoins(prisma, {
      agencyId: oa.id,
      agentOwnerId: oa.ownerId,
      windowEnd: now,
      rollingDays: COMMISSION_ROLLING_DAYS,
      windowStartNotBefore: oa.createdAt,
    });
    const tier = await resolveTier(rollingTurnoverCoins);
    const commissionOvActive = isCommissionOverrideActiveAt({
      rateOverride: oa.commissionRateOverride,
      validUntil: oa.commissionRateOverrideValidUntil,
      at: now,
    });
    const effectiveCommissionRate =
      commissionOvActive && oa.commissionRateOverride != null
        ? Number(oa.commissionRateOverride)
        : tier.commissionRate;

    const rollingGiftBonusIncome = await sumRollingAgencyHostIncome(prisma, {
      agencyId: oa.id,
      agentOwnerId: oa.ownerId,
      windowEnd: now,
      rollingDays: GIFT_BONUS_ROLLING_DAYS,
      windowStartNotBefore: oa.createdAt,
    });
    const gbTier = await resolveGiftBonusTier(rollingGiftBonusIncome);
    const giftBonusOvActive = isGiftBonusOverrideActiveAt({
      rateOverride: oa.giftBonusRateOverride,
      validUntil: oa.giftBonusRateOverrideValidUntil,
      at: now,
    });
    const [giftBonusTierCount, bonusSettingRow] = await Promise.all([
      prisma.giftBonusTier.count(),
      prisma.giftBonusSetting.findUniqueOrThrow({ where: { id: "singleton" } }),
    ]);
    const effectiveGiftBonusRate = resolveGiftBonusRateFromSetting({
      globallyEnabled: bonusSettingRow.enabled,
      agencyEnabled: oa.giftBonusEnabled,
      fallbackBonusRate: Number(bonusSettingRow.bonusRate),
      tierRowCount: giftBonusTierCount,
      tierBonusRate: gbTier?.bonusRate,
      overrideRate:
        oa.giftBonusRateOverride != null
          ? Number(oa.giftBonusRateOverride)
          : null,
      overrideActive: giftBonusOvActive,
    });

    (user as Record<string, unknown>).ownedAgency = {
      ...oa,
      rollingThirtyDayTurnoverCoins: rollingTurnoverCoins.toString(),
      commissionTier: { name: tier.name, commissionRate: tier.commissionRate },
      effectiveCommissionRate,
      rollingSevenDayAgencyHostIncomeBeans: rollingGiftBonusIncome.toString(),
      rollingSevenDayOwnIdIncomeBeans: rollingGiftBonusIncome.toString(),
      giftBonusTier: gbTier
        ? { name: gbTier.name, bonusRate: gbTier.bonusRate }
        : null,
      effectiveGiftBonusRate,
    };
  }

  const hasPassword = user.password != null;
  const pw = buildLoginPasswordDisplay(user.passwordSnapshot, hasPassword);
  const canView = options?.canViewPassword ?? false;

  const agency = user.agent?.ownedAgency;
  const bd = agency?.bd;
  const inviteCode = user.receivedInvite?.code ?? null;

  const result = {
    ...user,
    password: undefined,
    passwordSnapshot: undefined,
    hasPassword,
    loginPasswordDisplay: canView ? pw.display : (hasPassword ? '••••••' : 'Not set'),
    loginPasswordCopyable: canView && pw.copyable,
    loginPasswordPlaintext: canView && pw.plaintext ? pw.plaintext : null,
    superAdminPower: user.settings?.superAdminPower ?? false,
    settings: undefined,
    lastLoginAt: user.lastSeenAt ?? user.updatedAt,
    inviteCode,
    referralCode: inviteCode,
    bdId: bd?.hakaId ?? bd?.id ?? agency?.bdId ?? null,
    bdDisplayName: bd?.displayName ?? null,
    assignedAdminId: bd?.managerId ?? null,
    agencyId: agency?.id ?? null,
    agencyName: agency?.name ?? null,
  };

  return result;
}

export interface BanUserInput {
  reason?: string;
  banType?: "permanent" | "temporary";
  expiresAt?: Date | null;
  proofUrl?: string;
  result?: string;
}

export async function banUser(
  adminId: string,
  userId: string,
  input: BanUserInput = {},
  ipAddress?: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404);

  const { hasSuperAdminPower } = await import("../../moderation/super-admin-power");
  if (await hasSuperAdminPower(userId)) {
    const admin = await prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { role: true },
    });
    if (admin?.role !== "super_admin") {
      throw new AppError("Cannot ban a user with super admin power", 403);
    }
  }

  const reason = input.reason?.trim() || "Banned by admin";
  const banType = input.banType ?? "permanent";
  const expiresAt = banType === "temporary" ? (input.expiresAt ?? null) : null;
  const proofUrl = input.proofUrl ?? "";
  const result = input.result ?? "";
  if (banType === "temporary" && !expiresAt) {
    throw new AppError("expiresAt is required for temporary bans", 400);
  }

  const existingBan = await prisma.ban.findFirst({
    where: { userId, type: "platform", isActive: true },
  });

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.user.update({ where: { id: userId }, data: { isActive: false } }),
    prisma.refreshToken.deleteMany({ where: { userId } }),
  ];
  if (existingBan) {
    // Update the existing ban so reason/duration changes from this admin call
    // are persisted instead of silently dropped.
    ops.unshift(
      prisma.ban.update({
        where: { id: existingBan.id },
        data: { reason, banType, expiresAt, bannedBy: adminId, isActive: true, proofUrl, result },
      }),
    );
  } else {
    ops.unshift(
      prisma.ban.create({
        data: {
          userId,
          adminId,
          bannedBy: adminId,
          type: "platform",
          reason,
          banType,
          expiresAt,
          isActive: true,
          proofUrl,
          result,
        },
      }),
    );
  }
  await prisma.$transaction(ops);

  await forceLogout(userId, "banned");
  await logAdminAction(
    adminId,
    "user.ban",
    "User",
    userId,
    { displayName: user.displayName, reason, banType, expiresAt },
    ipAddress,
  );
  return { message: `User ${user.displayName} banned` };
}

export async function unbanUser(
  adminId: string,
  userId: string,
  ipAddress?: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404);

  await prisma.$transaction([
    prisma.ban.updateMany({
      where: { userId, type: "platform", isActive: true },
      data: { isActive: false },
    }),
    prisma.user.update({ where: { id: userId }, data: { isActive: true } }),
  ]);

  await logAdminAction(
    adminId,
    "user.unban",
    "User",
    userId,
    { displayName: user.displayName },
    ipAddress,
  );
  return { message: `User ${user.displayName} unbanned` };
}

export async function changeUserRole(
  adminId: string,
  userId: string,
  role: string,
  ipAddress?: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404);

  const oldRole = user.role;
  const roleUpdate: Prisma.UserUpdateInput = { role };
  if (role === "host" && user.role !== "host") {
    roleUpdate.hostType = user.hostType || "independent";
    if (!user.hostApplicationPath) {
      roleUpdate.hostApplicationPath = "self_apply_independent";
    }
  }
  if (role !== "host" && user.role === "host") {
    roleUpdate.hostType = "";
    roleUpdate.hostApplicationPath = "";
  }
  await prisma.user.update({ where: { id: userId }, data: roleUpdate });

  if (role === "agent") {
    const { ensureAgencyForAgentOwner } = await import(
      "../../agency/agency.service"
    );
    await ensureAgencyForAgentOwner(userId);
  }

  await logAdminAction(
    adminId,
    "user.role_change",
    "User",
    userId,
    { oldRole, newRole: role },
    ipAddress,
  );
  return { message: `Role changed from ${oldRole} to ${role}` };
}

export async function deactivateUser(
  adminId: string,
  userId: string,
  ipAddress?: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404);

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: false },
  });
  await logAdminAction(
    adminId,
    "user.deactivate",
    "User",
    userId,
    undefined,
    ipAddress,
  );
  return { message: `User deactivated` };
}

export async function activateUser(
  adminId: string,
  userId: string,
  ipAddress?: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404);

  await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
  await logAdminAction(
    adminId,
    "user.activate",
    "User",
    userId,
    undefined,
    ipAddress,
  );
  return { message: `User activated` };
}

export async function deleteUser(
  adminId: string,
  userId: string,
  ipAddress?: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404);

  await logAdminAction(
    adminId,
    "user.delete",
    "User",
    userId,
    { displayName: user.displayName, hakaId: user.hakaId },
    ipAddress,
  );
  await prisma.user.delete({ where: { id: userId } });
  return { message: `User ${user.displayName} permanently deleted` };
}

export interface EditUserData {
  displayName?: string;
  username?: string;
  phone?: string;
  email?: string;
  country?: string;
  city?: string;
  gender?: string;
  bio?: string;
}

function normalizeAdminPhone(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) throw new AppError("Phone number is required", 400);
  return trimmed.startsWith("+") ? trimmed : `+${trimmed.replace(/\D/g, "")}`;
}

export async function adminUpdateDisplayName(
  adminId: string,
  userId: string,
  displayName: string,
  ipAddress?: string,
) {
  if (!displayName.trim()) throw new AppError("Display name is required", 400);
  return editUser(adminId, userId, { displayName: displayName.trim() }, ipAddress);
}

export async function adminUpdateCountry(
  adminId: string,
  userId: string,
  country: string,
  ipAddress?: string,
) {
  if (!country.trim()) throw new AppError("Country is required", 400);
  return editUser(adminId, userId, { country: country.trim() }, ipAddress);
}

export async function adminUpdateGender(
  adminId: string,
  userId: string,
  gender: string,
  ipAddress?: string,
) {
  const normalized = gender === "male" || gender === "female" ? gender : "";
  return editUser(adminId, userId, { gender: normalized }, ipAddress);
}

export async function adminUpdatePhone(
  adminId: string,
  userId: string,
  phone: string,
  ipAddress?: string,
) {
  const normalized = normalizeAdminPhone(phone);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, supabaseUid: true },
  });
  if (!user) throw new AppError("User not found", 404);

  const existing = await prisma.user.findFirst({
    where: { phone: normalized, NOT: { id: userId } },
    select: { id: true },
  });
  if (existing) throw new AppError("This phone number is already linked to another account", 409);

  if (user.supabaseUid) {
    if (!supabase) throw new AppError("Supabase is not configured", 500);
    const { error } = await supabase.auth.admin.updateUserById(user.supabaseUid, {
      phone: normalized,
    });
    if (error) throw new AppError(`Supabase error: ${error.message}`, 500);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { phone: normalized },
  });
  await logAdminAction(adminId, "user.edit_phone", "User", userId, {
    phoneMasked: `***${normalized.slice(-4)}`,
  }, ipAddress);
  return updated;
}

export async function editUser(
  adminId: string,
  userId: string,
  data: EditUserData,
  ipAddress?: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404);

  const updated = await prisma.user.update({ where: { id: userId }, data });
  await logAdminAction(
    adminId,
    "user.edit",
    "User",
    userId,
    { fields: Object.keys(data) },
    ipAddress,
  );
  return updated;
}

export async function updateUserAvatar(
  adminId: string,
  userId: string,
  avatarUrl: string,
  ipAddress?: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { avatar: avatarUrl },
  });
  await logAdminAction(
    adminId,
    "user.update_avatar",
    "User",
    userId,
    {},
    ipAddress,
  );
  return updated;
}

export async function adjustCoins(
  adminId: string,
  userId: string,
  amount: number,
  currency: "coins" | "beans",
  reason: string,
  ipAddress?: string,
) {
  if (amount === 0) throw new AppError("Amount cannot be zero", 400);

  const absAmount = Math.abs(amount);

  if (currency === "coins") {
    // COINS: always route through Master Wallet ledger (double-entry)
    if (amount > 0) {
      await masterCreditUser(adminId, userId, absAmount, reason, ipAddress);
    } else {
      await masterDeductUser(adminId, userId, absAmount, reason, ipAddress);
    }
  } else {
    // BEANS: separate economy (earned from gifts) — direct credit/debit with audit
    if (amount > 0) {
      await creditBeans(
        userId,
        absAmount,
        `admin_adjustment_${Date.now()}`,
        `Admin adjustment: ${reason}`,
      );
    } else {
      await debitBeans(
        userId,
        absAmount,
        `admin_adjustment_${Date.now()}`,
        `Admin adjustment: ${reason}`,
      );
    }
    await logAdminAction(
      adminId,
      "user.adjust_beans",
      "User",
      userId,
      { amount, reason },
      ipAddress,
    );
  }

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  return {
    coinBalance: wallet?.coinBalance ?? 0,
    beanBalance: wallet?.beanBalance ?? 0,
  };
}

export async function getSameDeviceUsers(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404);

  // Get all devices for this user
  const userDevices = await prisma.userDevice.findMany({ where: { userId } });

  if (userDevices.length === 0) {
    return { devices: [], linkedAccounts: [] };
  }

  const deviceIds = userDevices.map((d) => d.deviceId);

  // Find all UserDevice rows with those deviceIds (all accounts, including self).
  // Admin UI expects this tab to show at least the current user when a deviceId exists.
  const sharedDevices = await prisma.userDevice.findMany({
    where: {
      deviceId: { in: deviceIds },
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          username: true,
          hakaId: true,
          avatar: true,
          role: true,
          isActive: true,
          createdAt: true,
          wallet: { select: { coinBalance: true, beanBalance: true } },
          riskControls: {
            where: { isActive: true },
            take: 1,
            select: { severity: true, reason: true },
          },
          bans: {
            where: { isActive: true },
            take: 1,
            select: { reason: true },
          },
        },
      },
    },
    orderBy: { lastLoginAt: "desc" },
  });

  // Deduplicate by userId, keep most-recent device entry per user
  const seenUsers = new Map<string, any>();
  for (const sd of sharedDevices) {
    if (!seenUsers.has(sd.userId)) {
      seenUsers.set(sd.userId, {
        ...sd.user,
        isSelf: sd.userId === userId,
        sharedDeviceId: sd.deviceId,
        sharedDeviceModel: sd.deviceModel,
        sharedPlatform: sd.platform,
        lastSeenAt: sd.lastLoginAt,
      });
    }
  }

  const deviceIdCounts = sharedDevices.reduce<Record<string, number>>(
    (acc, row) => {
      acc[row.deviceId] = (acc[row.deviceId] ?? 0) + 1;
      return acc;
    },
    {},
  );

  // Devices registered to this user with details
  const devices = userDevices.map((d) => ({
    deviceId: d.deviceId,
    deviceModel: d.deviceModel,
    platform: d.platform,
    appVersion: d.appVersion,
    lastLoginAt: d.lastLoginAt,
    // otherAccounts: number of *other* users seen on this deviceId
    otherAccounts: Math.max(0, (deviceIdCounts[d.deviceId] ?? 0) - 1),
  }));

  return { devices, linkedAccounts: Array.from(seenUsers.values()) };
}

export async function muteUser(
  adminId: string,
  userId: string,
  ipAddress?: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404);

  const { hasSuperAdminPower } = await import("../../moderation/super-admin-power");
  if (await hasSuperAdminPower(userId)) {
    const admin = await prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { role: true },
    });
    if (admin?.role !== "super_admin") {
      throw new AppError("Cannot mute a user with super admin power", 403);
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { isMuted: true } });
  try {
    const io = getIO();
    io.to(`user:${userId}`).emit("user:muted", { reason: "muted_by_admin" });
  } catch {
    /* socket may be unavailable */
  }
  await logAdminAction(
    adminId,
    "user.mute",
    "User",
    userId,
    { displayName: user.displayName },
    ipAddress,
  );
  return { message: `User ${user.displayName} muted` };
}

export async function unmuteUser(
  adminId: string,
  userId: string,
  ipAddress?: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404);

  await prisma.user.update({ where: { id: userId }, data: { isMuted: false } });
  try {
    const io = getIO();
    io.to(`user:${userId}`).emit("user:unmuted", {});
  } catch {
    /* socket may be unavailable */
  }
  await logAdminAction(
    adminId,
    "user.unmute",
    "User",
    userId,
    { displayName: user.displayName },
    ipAddress,
  );
  return { message: `User ${user.displayName} unmuted` };
}

// ── Host ban ──────────────────────────────────────────────────────────────────

export interface HostBanInput {
  reason?: string;
  banType?: "permanent" | "temporary";
  expiresAt?: Date | null;
}

/**
 * Stop a user from going live: flips `isHostBanned`, writes a `Ban` row of
 * `type='host'`, and vacates them from every mic seat in rooms they host
 * (room stays live for remaining participants).
 *
 * This does NOT log the user out — they can still browse/chat/gift. Use
 * `banUser` for a full platform ban.
 */
export async function hostBanUser(
  adminId: string,
  userId: string,
  input: HostBanInput = {},
  ipAddress?: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404);

  const reason = input.reason?.trim() || "Host banned by admin";
  const banType = input.banType ?? "permanent";
  const expiresAt = banType === "temporary" ? (input.expiresAt ?? null) : null;
  if (banType === "temporary" && !expiresAt) {
    throw new AppError("expiresAt is required for temporary host bans", 400);
  }

  const existingBan = await prisma.ban.findFirst({
    where: { userId, type: "host", isActive: true },
  });

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.user.update({ where: { id: userId }, data: { isHostBanned: true } }),
  ];
  if (existingBan) {
    ops.unshift(
      prisma.ban.update({
        where: { id: existingBan.id },
        data: { reason, banType, expiresAt, bannedBy: adminId, isActive: true },
      }),
    );
  } else {
    ops.unshift(
      prisma.ban.create({
        data: {
          userId,
          adminId,
          bannedBy: adminId,
          type: "host",
          reason,
          banType,
          expiresAt,
          isActive: true,
        },
      }),
    );
  }
  await prisma.$transaction(ops);

  const activeRooms = await prisma.room.findMany({
    where: { hostId: userId, status: { not: "ended" } },
    select: { id: true, title: true },
  });

  for (const r of activeRooms) {
    const vacated = await vacateUserFromRoomSeats(r.id, userId);
    if (vacated.length > 0) {
      try {
        const io = getIO();
        for (const s of vacated) {
          io.to(r.id).emit("seat.updated", {
            position: s.position,
            userId: null,
            user: null,
            isLocked: s.isLocked,
            isMuted: false,
          });
        }
      } catch {
        /* socket may be unavailable */
      }
      await logAdminAction(
        adminId,
        "room.host_vacated",
        "Room",
        r.id,
        {
          title: r.title,
          cause: "host_banned",
          hostId: userId,
          seats: vacated.map((x) => x.position),
        },
        ipAddress,
      );
    }
  }

  await logAdminAction(
    adminId,
    "user.host_ban",
    "User",
    userId,
    {
      displayName: user.displayName,
      reason,
      banType,
      expiresAt,
      roomsTouched: activeRooms.length,
    },
    ipAddress,
  );
  return {
    message: `Host ${user.displayName} banned`,
    roomsTouched: activeRooms.length,
  };
}

export async function hostUnbanUser(
  adminId: string,
  userId: string,
  ipAddress?: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404);

  await prisma.$transaction([
    prisma.ban.updateMany({
      where: { userId, type: "host", isActive: true },
      data: { isActive: false },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { isHostBanned: false },
    }),
  ]);

  await logAdminAction(
    adminId,
    "user.host_unban",
    "User",
    userId,
    { displayName: user.displayName },
    ipAddress,
  );
  return { message: `Host ${user.displayName} unbanned` };
}

/** Tier for the displayed special 6-digit HAKA ID (SVGA badge). */
export const SPECIAL_HAKA_ID_LEVELS = ["SSS", "SS", "S", "A", "B"] as const;
export type SpecialHakaIdLevel = (typeof SPECIAL_HAKA_ID_LEVELS)[number];

export async function forceSetSpecialHakaIdLevel(
  adminId: string,
  userId: string,
  level: SpecialHakaIdLevel,
  ipAddress?: string,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      activeSpecialId: true,
      activeSpecialIdLevel: true,
    },
  });
  if (!user) throw new AppError("User not found", 404);
  if (!user.activeSpecialId) {
    throw new AppError(
      "User has no active special HAKA ID. The user must have a special ID activated first.",
      400,
    );
  }

  const oldLevel = user.activeSpecialIdLevel;
  const activeNumber = user.activeSpecialId;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { activeSpecialIdLevel: level },
    });

    const activeInv = await tx.specialIdInventory.findFirst({
      where: { userId, status: "active" },
      include: { specialId: true },
    });
    if (activeInv?.specialId.number === activeNumber) {
      await tx.specialId.update({
        where: { id: activeInv.specialIdId },
        data: { level },
      });
    }
  });

  await logAdminAction(
    adminId,
    "user.force_special_haka_id_level",
    "User",
    userId,
    { oldLevel, newLevel: level, activeSpecialId: activeNumber },
    ipAddress,
  );

  return {
    activeSpecialId: activeNumber,
    activeSpecialIdLevel: level,
  };
}

export async function forceSetLevel(
  userId: string,
  data: {
    richLevel?: number;
    richXp?: number;
    charmLevel?: number;
    charmXp?: number;
  },
  adminId: string,
  ip: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404);

  const patch = { ...data };
  if (patch.richLevel !== undefined) {
    if (patch.richLevel < 1 || patch.richLevel > MAX_LEVEL) {
      throw new AppError(`Rich level must be between 1 and ${MAX_LEVEL}`, 400);
    }
    if (patch.richXp === undefined) {
      patch.richXp = patch.richLevel <= 1 ? 0 : XP_THRESHOLDS[patch.richLevel - 1];
    }
  }
  if (patch.charmLevel !== undefined) {
    if (patch.charmLevel < 1 || patch.charmLevel > MAX_LEVEL) {
      throw new AppError(`Charm level must be between 1 and ${MAX_LEVEL}`, 400);
    }
    if (patch.charmXp === undefined) {
      patch.charmXp = patch.charmLevel <= 1 ? 0 : CHARM_XP_THRESHOLDS[patch.charmLevel - 1];
    }
  }

  const bigData = {
    ...patch,
    ...(patch.richXp !== undefined && { richXp: BigInt(patch.richXp) }),
    ...(patch.charmXp !== undefined && { charmXp: BigInt(patch.charmXp) }),
  };

  const level = await prisma.userLevel.upsert({
    where: { userId },
    update: bigData,
    create: {
      userId,
      richLevel: 1,
      richXp: 0n,
      charmLevel: 1,
      charmXp: 0n,
      ...bigData,
    },
  });

  await logAdminAction(adminId, "user.force_level", "User", userId, data, ip);
  return level;
}

export async function setHostStatus(
  userId: string,
  data: { isVerifiedHost?: boolean; isPremiumHost?: boolean },
  adminId: string,
  ip: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404);
  if (user.role !== "host") throw new AppError("User is not a host", 400);

  const updated = await prisma.user.update({ where: { id: userId }, data });
  await logAdminAction(
    adminId,
    "user.set_host_status",
    "User",
    userId,
    data,
    ip,
  );
  return updated;
}

export async function resetUserPassword(
  userId: string,
  newPassword: string,
  adminId: string,
  ip: string,
) {
  if (newPassword.length < 6) {
    throw new AppError("Password must be at least 6 characters", 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, supabaseUid: true },
  });
  if (!user) throw new AppError("User not found", 404);

  const passwordHash = await bcrypt.hash(newPassword, 10);
  let snapshot = "";
  try {
    snapshot = encryptPasswordSnapshot(newPassword);
  } catch {
    /* encryption key not configured */
  }
  await prisma.user.update({
    where: { id: userId },
    data: { password: passwordHash, passwordSnapshot: snapshot },
  });

  // Sync Supabase Auth when the account is linked (Google / phone via Supabase).
  if (user.supabaseUid) {
    if (!supabase) throw new AppError("Supabase is not configured", 500);
    const { error } = await supabase.auth.admin.updateUserById(user.supabaseUid, {
      password: newPassword,
    });
    if (error) {
      throw new AppError(`Supabase error: ${error.message}`, 500);
    }
  }

  await logAdminAction(adminId, "user.reset_password", "User", userId, {
    supabaseSynced: Boolean(user.supabaseUid),
  }, ip);
}

const OTP_RATE_LIMIT = 3;
const OTP_RATE_WINDOW_SEC = 3600;

export async function sendLoginOtp(
  userId: string,
  adminId: string,
  ip: string,
  channel: "sms" | "whatsapp" = "sms",
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, phone: true },
  });
  if (!user) throw new AppError("User not found", 404);
  if (!user.phone?.trim()) {
    throw new AppError("User has no phone number on file", 400);
  }
  if (!supabase) throw new AppError("Supabase is not configured", 500);

  const rateKey = `admin:login_otp:${userId}`;
  try {
    const count = await redis.incr(rateKey);
    if (count === 1) await redis.expire(rateKey, OTP_RATE_WINDOW_SEC);
    if (count > OTP_RATE_LIMIT) {
      throw new AppError("OTP send rate limit exceeded for this user (max 3 per hour)", 429);
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    /* Redis unavailable — allow send */
  }

  const { error } = await supabase.auth.signInWithOtp({
    phone: user.phone,
    options: channel === "whatsapp" ? { channel: "whatsapp" } : undefined,
  });
  if (error) throw new AppError(`Failed to send OTP: ${error.message}`, 502);

  const last4 = user.phone.slice(-4);
  await logAdminAction(adminId, "user.send_login_otp", "User", userId, {
    phoneMasked: `***${last4}`,
    channel,
  }, ip);

  return { sent: true, phoneMasked: `***${last4}`, channel };
}

export async function getSuperAdminPower(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, settings: { select: { superAdminPower: true } } },
  });
  if (!user) throw new AppError("User not found", 404);
  return { enabled: user.settings?.superAdminPower ?? false };
}

export async function setSuperAdminPower(
  userId: string,
  enabled: boolean,
  adminId: string,
  ip: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new AppError("User not found", 404);

  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, superAdminPower: enabled },
    update: { superAdminPower: enabled },
  });

  await forceLogout(userId, "super_admin_power_changed");
  await logAdminAction(adminId, "user.super_admin_power", "User", userId, { enabled }, ip);
  return { enabled };
}

// ── Invitation bind record ─────────────────────────────────────────────────────

export async function getUserInvitations(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new AppError("User not found", 404);

  const [sent, received] = await Promise.all([
    prisma.inviteCode.findMany({
      where: { inviterId: userId },
      include: {
        invitee: { select: { id: true, displayName: true, hakaId: true, avatar: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.inviteCode.findFirst({
      where: { inviteeId: userId },
      include: {
        inviter: { select: { id: true, displayName: true, hakaId: true, avatar: true } },
      },
    }),
  ]);

  return { sent, received };
}

// ── Profile background pass (store items) ─────────────────────────────────────

export async function getUserStoreItems(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new AppError("User not found", 404);

  return prisma.userStoreItem.findMany({
    where: { userId },
    include: { item: true },
    orderBy: { purchasedAt: "desc" },
  });
}

export async function grantStoreItemToUser(
  adminId: string,
  userId: string,
  itemId: string,
  durationDays: number | null,
  ipAddress?: string,
  opts?: { quantity?: number; reason?: string },
) {
  const { grantStoreItemToUserInternal } = await import('../store/admin-store-distribution.service');
  const result = await grantStoreItemToUserInternal({
    adminId,
    userId,
    itemId,
    quantity: opts?.quantity ?? 1,
    reason: opts?.reason ?? 'Admin grant',
    durationDays,
    channel: 'single',
    audienceType: 'user_ids',
    ip: ipAddress,
  });
  return result.userItems[0] ?? result.userItems;
}

export async function removeStoreItemFromUser(
  adminId: string,
  userId: string,
  userStoreItemId: string,
  ipAddress?: string,
) {
  const existing = await prisma.userStoreItem.findFirst({
    where: { id: userStoreItemId, userId },
  });
  if (!existing) throw new AppError("Store item not found for this user", 404);

  await prisma.userStoreItem.delete({ where: { id: userStoreItemId } });
  await logAdminAction(adminId, "user.remove_store_item", "User", userId, { userStoreItemId }, ipAddress);
  return { removed: true, userStoreItemId };
}
