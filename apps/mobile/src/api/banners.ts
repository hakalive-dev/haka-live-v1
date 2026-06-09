import { apiClient } from './client';
import { useMock } from './config';

export type BannerPlacement = 'home_top' | 'profile_agent' | 'discover_top' | 'room_banner';

export interface Banner {
  id: string;
  imageUrl: string;
  title: string;
  subtitle: string;
  redirectType: 'event' | 'external' | 'user_profile' | 'game';
  redirectValue: string;
  placement: BannerPlacement;
  priority: number;
}

export const bannersApi = {
  /** GET /api/v1/banners?placement=... */
  async list(placement?: BannerPlacement): Promise<Banner[]> {
    if (useMock) return [];
    const res = await apiClient.get('/banners', { params: placement ? { placement } : undefined });
    return (res.data ?? []) as Banner[];
  },
};
