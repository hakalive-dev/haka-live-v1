import { apiClient } from './client';

export type FaceChallengeKey = 'nod' | 'turn_left' | 'turn_right' | 'blink' | 'smile';

export interface FaceChallenge {
  key: FaceChallengeKey;
  label: string;
}

export interface FaceVerificationStatus {
  status: string;
  facePhotoUrl: string;
  rejectReason: string;
  verifiedAt: string | null;
  pendingSessionId: string | null;
  canStart: boolean;
}

export interface CreateSessionResult {
  sessionId: string;
  challenges: FaceChallenge[];
}

export interface SignedFrameUpload {
  uploadUrl: string;
  token: string;
  path: string;
  publicUrl: string;
}

export const faceVerificationApi = {
  getStatus: async (): Promise<FaceVerificationStatus> => {
    const res = await apiClient.get('/face-verification/status');
    return res.data;
  },

  createSession: async (): Promise<CreateSessionResult> => {
    const res = await apiClient.post('/face-verification/session');
    return res.data;
  },

  signFrameUpload: async (
    sessionId: string,
    step: FaceChallengeKey,
    ext: 'jpg' | 'jpeg' | 'png' | 'webp' = 'jpg',
  ): Promise<SignedFrameUpload> => {
    const res = await apiClient.post(`/face-verification/session/${sessionId}/frame/upload`, {
      step,
      ext,
    });
    return res.data;
  },

  registerFrame: async (
    sessionId: string,
    step: FaceChallengeKey,
    publicUrl: string,
  ): Promise<void> => {
    await apiClient.post(`/face-verification/session/${sessionId}/frame`, {
      step,
      publicUrl,
    });
  },

  submitSession: async (sessionId: string): Promise<{ status: string; message: string }> => {
    // Rekognition compares every liveness frame — often >10s; do not use the default api timeout.
    const res = await apiClient.post(
      `/face-verification/session/${sessionId}/submit`,
      {},
      { timeout: 120_000 },
    );
    return res.data;
  },

  uploadFrameFromUri: async (
    sessionId: string,
    step: FaceChallengeKey,
    localUri: string,
  ): Promise<void> => {
    const filename = localUri.split('/').pop() ?? 'frame.jpg';
    const rawExt = (/\.(\w+)$/.exec(filename) ?? [])[1]?.toLowerCase() ?? 'jpg';
    const ext = (['jpg', 'jpeg', 'png', 'webp'] as const).includes(rawExt as 'jpg')
      ? (rawExt as 'jpg' | 'jpeg' | 'png' | 'webp')
      : 'jpg';
    const mimeType = `image/${rawExt === 'jpg' ? 'jpeg' : rawExt}`;

    const signed = await faceVerificationApi.signFrameUpload(sessionId, step, ext);
    const blob = await fetch(localUri).then((r) => r.blob());
    const uploadRes = await fetch(signed.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: blob,
    });
    if (!uploadRes.ok) throw new Error('Failed to upload frame');
    await faceVerificationApi.registerFrame(sessionId, step, signed.publicUrl);
  },
};
