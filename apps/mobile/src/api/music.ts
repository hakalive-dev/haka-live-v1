import { uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy';
import { apiClient } from './client';
import { TokenStorage } from '../storage';
import type { UserMusicTrack } from '@/types';

interface LibraryResponse {
  tracks: UserMusicTrack[];
  total: number;
}

export const musicApi = {
  /** List the current user's personal music library (optional name filter). */
  getLibrary: async (query?: string): Promise<LibraryResponse> => {
    const params = query ? { q: query } : undefined;
    const res = await apiClient.get<LibraryResponse>('/music/library', { params });
    return res.data;
  },

  /**
   * Upload a local audio file to the user's personal music library.
   * Uses native multipart upload (no fetch body timeout) — same as room queue uploads.
   */
  uploadToLibrary: async (
    fileUri: string,
    mimeType: string,
    filename: string,
  ): Promise<{ track: UserMusicTrack }> => {
    const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3010/api/v1';
    const token = await TokenStorage.getAccess();
    const result = await uploadAsync(
      `${baseUrl}/music/library`,
      fileUri,
      {
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        mimeType,
        headers: {
          Authorization: token ? `Bearer ${token}` : '',
          'ngrok-skip-browser-warning': 'true',
        },
        parameters: { filename },
      },
    );
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Upload failed (${result.status})`);
    }
    let body: { success?: boolean; data?: { track: UserMusicTrack }; message?: string };
    try {
      body = JSON.parse(result.body);
    } catch {
      throw new Error('Upload failed (invalid response)');
    }
    if (body.success === false) {
      throw new Error(body.message ?? 'Upload failed');
    }
    const data = body.data ?? (body as unknown as { track: UserMusicTrack });
    if (!data?.track) throw new Error('Upload failed (no track returned)');
    return data;
  },

  /** Delete a track from the user's personal music library. */
  deleteFromLibrary: async (trackId: string): Promise<void> => {
    await apiClient.delete(`/music/library/${trackId}`);
  },
};
