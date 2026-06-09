import { apiClient } from './client';

export interface SupportTicket {
  id: string;
  userId: string;
  description: string;
  screenshotUrl: string;
  screenshotUrls: string[];
  status: string;
  adminReply: string;
  repliedAt: string | null;
  createdAt: string;
}

export const supportApi = {
  async createTicket(description: string, screenshotUrls: string[]): Promise<SupportTicket> {
    const res = await apiClient.post('/support/tickets', { description, screenshotUrls });
    return res.data as SupportTicket;
  },

  async getMyTickets(page = 1): Promise<{ items: SupportTicket[]; total: number; hasMore: boolean }> {
    const res = await apiClient.get(`/support/tickets?page=${page}`);
    return res.data;
  },

  async uploadScreenshot(uri: string): Promise<string> {
    const filename = uri.split('/').pop() ?? 'screenshot.jpg';
    const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

    const form = new FormData();
    form.append('file', { uri, name: filename, type: mimeType } as any);

    const res = await apiClient.post('/support/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return (res.data as { url: string }).url;
  },
};
