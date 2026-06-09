import client from './client'

export interface FaceVerificationListResult {
  items: Array<{
    id: string
    submittedAt: string | null
    referenceFrameUrl: string | null
    frameUrls: Record<string, string>
    user?: { id: string; displayName: string; hakaId: string; avatar: string }
  }>
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

export function listFaceVerifications(
  params: { page?: number; limit?: number },
): Promise<FaceVerificationListResult> {
  return client.get('/face-verifications', { params })
}

export function getFaceVerification(sessionId: string): Promise<Record<string, unknown>> {
  return client.get(`/face-verifications/${sessionId}`)
}

export function approveFaceVerification(sessionId: string) {
  return client.post(`/face-verifications/${sessionId}/approve`)
}

export function rejectFaceVerification(sessionId: string, reason: string) {
  return client.post(`/face-verifications/${sessionId}/reject`, { reason })
}
