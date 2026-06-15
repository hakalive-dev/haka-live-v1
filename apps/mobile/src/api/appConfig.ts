import { apiClient } from './client';

/** Per-platform update info for the in-app "Update available" gate. */
export interface PlatformUpdateConfig {
  latest_version_code: number;
  latest_version_name: string;
  min_supported_version_code: number;
  store_url: string;
  release_notes: string[];
}

export interface AppConfig {
  android?: PlatformUpdateConfig;
  ios?: PlatformUpdateConfig;
}

export const appConfigApi = {
  /** Public — no auth required. Drives the launch-time update gate. */
  getConfig: async (): Promise<AppConfig> => {
    const res = await apiClient.get<AppConfig>('/config');
    return res.data ?? {};
  },
};
