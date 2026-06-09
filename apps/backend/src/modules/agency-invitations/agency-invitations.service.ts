import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../middleware/error.middleware';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface InvitationDTO {
  id: string;
  fromAgency: { id: string; name: string; owner: { displayName: string } };
  toAgency:   { id: string; name: string; owner: { displayName: string } };
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  note: string;
  reviewedBy: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

type InvitationRow = Prisma.AgencyInvitationGetPayload<{
  include: {
    fromAgency: { include: { owner: true } };
    toAgency:   { include: { owner: true } };
  };
}>;

const AGENCY_INCLUDE = {
  fromAgency: { include: { owner: true } },
  toAgency:   { include: { owner: true } },
} as const;

const WITH_AGENCIES = { include: AGENCY_INCLUDE } as const;

function toDTO(row: InvitationRow): InvitationDTO {
  return {
    id: row.id,
    fromAgency: {
      id:    row.fromAgency.id,
      name:  row.fromAgency.name,
      owner: { displayName: row.fromAgency.owner.displayName },
    },
    toAgency: {
      id:    row.toAgency.id,
      name:  row.toAgency.name,
      owner: { displayName: row.toAgency.owner.displayName },
    },
    status:     row.status as InvitationDTO['status'],
    note:       row.note,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    createdAt:  row.createdAt.toISOString(),
    updatedAt:  row.updatedAt.toISOString(),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function requireAgencyOwnedBy(userId: string, agencyId: string) {
  const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
  if (!agency) throw new AppError('not_found', 404);
  if (agency.ownerId !== userId) throw new AppError('forbidden', 403);
  return agency;
}

async function assertDepth2Eligible(fromAgencyId: string, toAgencyId: string) {
  const [from, to, toChildren] = await Promise.all([
    prisma.agency.findUnique({ where: { id: fromAgencyId } }),
    prisma.agency.findUnique({ where: { id: toAgencyId } }),
    prisma.agency.count({ where: { parentAgencyId: toAgencyId } }),
  ]);
  if (!from || !to) throw new AppError('not_found', 404);
  if (from.status !== 'active' || to.status !== 'active') {
    throw new AppError('agency_not_active', 409);
  }
  if (from.parentAgencyId !== null) {
    throw new AppError('chain_depth_violation', 409);
  }
  if (to.parentAgencyId !== null) {
    throw new AppError('target_already_sub_agency', 409);
  }
  if (toChildren > 0) {
    throw new AppError('chain_depth_violation', 409);
  }
}

// ── Owner operations ───────────────────────────────────────────────────────────

export async function createInvitation(input: {
  callerUserId: string;
  toAgencyId: string;
  note?: string;
}): Promise<InvitationDTO> {
  const fromAgency = await prisma.agency.findUnique({ where: { ownerId: input.callerUserId } });
  if (!fromAgency) throw new AppError('forbidden', 403);
  if (input.toAgencyId === fromAgency.id) throw new AppError('self_invitation', 409);

  await assertDepth2Eligible(fromAgency.id, input.toAgencyId);

  const duplicate = await prisma.agencyInvitation.findFirst({
    where: { fromAgencyId: fromAgency.id, toAgencyId: input.toAgencyId, status: 'pending' },
  });
  if (duplicate) throw new AppError('pending_invitation_exists', 409);

  const row = await prisma.agencyInvitation.create({
    data: {
      fromAgencyId: fromAgency.id,
      toAgencyId:   input.toAgencyId,
      note:         input.note ?? '',
      status:       'pending',
    },
    ...WITH_AGENCIES,
  });
  return toDTO(row);
}

export async function listInvitationsForOwner(
  callerUserId: string,
): Promise<{ sent: InvitationDTO[]; received: InvitationDTO[] }> {
  const agency = await prisma.agency.findUnique({ where: { ownerId: callerUserId } });
  if (!agency) return { sent: [], received: [] };

  const rows = await prisma.agencyInvitation.findMany({
    where: {
      OR: [{ fromAgencyId: agency.id }, { toAgencyId: agency.id }],
    },
    orderBy: { createdAt: 'desc' },
    ...WITH_AGENCIES,
  });

  const sent     = rows.filter(r => r.fromAgencyId === agency.id).map(toDTO);
  const received = rows.filter(r => r.toAgencyId   === agency.id).map(toDTO);
  return { sent, received };
}

export async function cancelInvitation(input: {
  callerUserId: string;
  invitationId: string;
}): Promise<InvitationDTO> {
  const inv = await prisma.agencyInvitation.findUnique({ where: { id: input.invitationId } });
  if (!inv) throw new AppError('not_found', 404);
  await requireAgencyOwnedBy(input.callerUserId, inv.fromAgencyId);
  if (inv.status !== 'pending') throw new AppError('invitation_already_finalized', 409);

  const updated = await prisma.agencyInvitation.update({
    where: { id: inv.id },
    data:  { status: 'cancelled', reviewedAt: new Date(), reviewedBy: '' },
    ...WITH_AGENCIES,
  });
  return toDTO(updated);
}

// ── Admin operations ───────────────────────────────────────────────────────────

export async function approveInvitation(input: {
  adminUserId: string;
  invitationId: string;
}): Promise<InvitationDTO> {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.agencyInvitation.findUnique({ where: { id: input.invitationId } });
    if (!inv) throw new AppError('not_found', 404);
    if (inv.status !== 'pending') throw new AppError('invitation_already_finalized', 409);

    const [from, to, toChildren] = await Promise.all([
      tx.agency.findUnique({ where: { id: inv.fromAgencyId } }),
      tx.agency.findUnique({ where: { id: inv.toAgencyId } }),
      tx.agency.count({ where: { parentAgencyId: inv.toAgencyId } }),
    ]);
    if (!from || !to) throw new AppError('not_found', 404);
    if (from.status !== 'active' || to.status !== 'active') throw new AppError('agency_not_active', 409);
    if (from.parentAgencyId !== null) throw new AppError('chain_depth_violation', 409);
    if (to.parentAgencyId !== null) throw new AppError('target_already_sub_agency', 409);
    if (toChildren > 0) throw new AppError('chain_depth_violation', 409);

    await tx.agency.update({
      where: { id: to.id },
      data:  { parentAgencyId: from.id },
    });
    const updated = await tx.agencyInvitation.update({
      where: { id: inv.id },
      data:  { status: 'approved', reviewedAt: new Date(), reviewedBy: input.adminUserId },
      include: AGENCY_INCLUDE,
    });
    return toDTO(updated);
  });
}

export async function rejectInvitation(input: {
  adminUserId: string;
  invitationId: string;
  note?: string;
}): Promise<InvitationDTO> {
  const inv = await prisma.agencyInvitation.findUnique({ where: { id: input.invitationId } });
  if (!inv) throw new AppError('not_found', 404);
  if (inv.status !== 'pending') throw new AppError('invitation_already_finalized', 409);

  const appendedNote = input.note
    ? (inv.note ? `${inv.note}\n---\n${input.note}` : input.note)
    : inv.note;

  const updated = await prisma.agencyInvitation.update({
    where: { id: inv.id },
    data:  {
      status:     'rejected',
      reviewedAt: new Date(),
      reviewedBy: input.adminUserId,
      note:       appendedNote,
    },
    ...WITH_AGENCIES,
  });
  return toDTO(updated);
}

export async function adminListInvitations(q: {
  status?: 'pending' | 'approved' | 'rejected' | 'cancelled';
  fromAgencyId?: string;
  toAgencyId?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ rows: InvitationDTO[]; nextCursor: string | null }> {
  const limit = Math.min(q.limit ?? 50, 200);

  const createdAtFilter: Record<string, Date> = {};
  if (q.from)   createdAtFilter.gte = new Date(q.from);
  if (q.to)     createdAtFilter.lte = new Date(q.to);
  if (q.cursor) {
    try {
      createdAtFilter.lt = new Date(
        JSON.parse(Buffer.from(q.cursor, 'base64url').toString()).createdAt,
      );
    } catch {
      throw new AppError('invalid_cursor', 400);
    }
  }

  const rows = await prisma.agencyInvitation.findMany({
    where: {
      ...(q.status       ? { status: q.status } : {}),
      ...(q.fromAgencyId ? { fromAgencyId: q.fromAgencyId } : {}),
      ...(q.toAgencyId   ? { toAgencyId:   q.toAgencyId   } : {}),
      ...(Object.keys(createdAtFilter).length > 0 ? { createdAt: createdAtFilter } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...WITH_AGENCIES,
  });

  const hasMore  = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last     = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && last
    ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString('base64url')
    : null;
  return { rows: pageRows.map(toDTO), nextCursor };
}
