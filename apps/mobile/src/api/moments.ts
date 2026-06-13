import { apiClient } from './client';
import type { MomentPost, MomentComment, MomentFeed } from '@/types';

export const momentsApi = {
  async list(type: 'moment' | 'video' = 'moment', page = 1): Promise<MomentFeed> {
    const res = await apiClient.get('/moments', { params: { type, page, page_size: 20 } });
    return res.data;
  },

  async listByUser(userId: string, page = 1): Promise<MomentFeed> {
    const res = await apiClient.get(`/moments/user/${userId}`, { params: { page, page_size: 20 } });
    return res.data;
  },

  async create(payload: FormData): Promise<MomentPost> {
    const res = await apiClient.post('/moments', payload, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  async get(id: string): Promise<MomentPost> {
    const res = await apiClient.get(`/moments/${id}`);
    return res.data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/moments/${id}`);
  },

  async toggleLike(id: string): Promise<{ liked: boolean; likes_count: number }> {
    const res = await apiClient.post(`/moments/${id}/like`);
    return res.data;
  },

  async getComments(id: string): Promise<MomentComment[]> {
    const res = await apiClient.get(`/moments/${id}/comments`);
    return res.data;
  },

  async postComment(id: string, text: string): Promise<MomentComment> {
    const res = await apiClient.post(`/moments/${id}/comments`, { text });
    return res.data;
  },

  async toggleCommentLike(
    momentId: string,
    commentId: string,
  ): Promise<{ liked: boolean; likes_count: number }> {
    const res = await apiClient.post(`/moments/${momentId}/comments/${commentId}/like`);
    return res.data;
  },

  async share(id: string, platform = ''): Promise<{ shares_count: number }> {
    const res = await apiClient.post(`/moments/${id}/share`, { platform });
    return res.data;
  },

  async sendGift(id: string, giftId: string): Promise<{ gift_name: string; coin_cost: number }> {
    const res = await apiClient.post(`/moments/${id}/gift`, { gift_id: giftId });
    return res.data;
  },
};
