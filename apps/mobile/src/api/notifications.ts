import { apiClient } from './client';
import { useMock } from './config';
import type { AppNotification, UnreadCount, PaginatedResult } from '../types';

const MOCK_NOTIFICATION: AppNotification = {
  id: 'notif-mock-1',
  userId: 'user-mock-1',
  type: 'gift_received',
  title: 'You received a gift!',
  body: 'Alice sent you a Rose.',
  imageUrl: '',
  data: null,
  isRead: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const notificationsApi = {
  /** Get paginated notifications for current user */
  async getAll(page = 1): Promise<PaginatedResult<AppNotification>> {
    if (useMock) {
      return { items: [MOCK_NOTIFICATION], total: 1, page: 1, limit: 20, hasMore: false };
    }
    const res = await apiClient.get(`/notifications?page=${page}`);
    return res.data as PaginatedResult<AppNotification>;
  },

  /** Get unread notification count */
  async getUnreadCount(): Promise<UnreadCount> {
    if (useMock) return { count: 3 };
    const res = await apiClient.get('/notifications/count');
    return res.data as UnreadCount;
  },

  /** Mark a single notification as read */
  async markRead(notificationId: string): Promise<AppNotification> {
    const res = await apiClient.patch(`/notifications/${notificationId}/read`);
    return res.data as AppNotification;
  },

  /** Mark all notifications as read */
  async markAllRead(): Promise<{ updated: number }> {
    const res = await apiClient.patch('/notifications/read-all');
    return res.data as { updated: number };
  },

  /** Register or update device FCM token */
  async updateFcmToken(token: string): Promise<{ updated: boolean }> {
    const res = await apiClient.post('/notifications/fcm-token', { token });
    return res.data as { updated: boolean };
  },
};
