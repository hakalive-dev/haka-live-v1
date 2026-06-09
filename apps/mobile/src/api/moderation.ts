import { apiClient } from './client';
import type { ReportRecord, BanRecord, PaginatedResult } from '../types';

export type ReportTargetType = 'user' | 'room' | 'message';

export const moderationApi = {
  /** Submit a report against a user, room, or message */
  async report(
    targetType: ReportTargetType,
    targetId: string,
    reason: string,
    description = '',
  ): Promise<ReportRecord> {
    const res = await apiClient.post('/moderation/report', { targetType, targetId, reason, description });
    return res.data as ReportRecord;
  },

  // ── Admin endpoints ────────────────────────────────────────────────────────

  async getReports(page = 1, status?: string): Promise<PaginatedResult<ReportRecord>> {
    const params = new URLSearchParams({ page: String(page) });
    if (status) params.set('status', status);
    const res = await apiClient.get(`/moderation/reports?${params}`);
    return res.data as PaginatedResult<ReportRecord>;
  },

  async reviewReport(id: string, status: 'reviewed' | 'dismissed'): Promise<ReportRecord> {
    const res = await apiClient.patch(`/moderation/reports/${id}`, { status });
    return res.data as ReportRecord;
  },

  async banUser(
    userId: string,
    reason: string,
    banType: 'permanent' | 'temporary',
    expiresAt?: string,
  ): Promise<BanRecord> {
    const res = await apiClient.post('/moderation/ban', { userId, reason, banType, expiresAt });
    return res.data as BanRecord;
  },

  async unbanUser(userId: string): Promise<{ userId: string; unbanned: boolean }> {
    const res = await apiClient.delete(`/moderation/ban/${userId}`);
    return res.data as { userId: string; unbanned: boolean };
  },

  async getBans(page = 1): Promise<PaginatedResult<BanRecord>> {
    const res = await apiClient.get(`/moderation/bans?page=${page}`);
    return res.data as PaginatedResult<BanRecord>;
  },
};
