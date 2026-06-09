-- Face verification on User + session audit trail
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "facePhotoUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "faceVerificationStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "faceVerifiedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "faceEnrollmentId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "faceRejectedReason" TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS "face_verification_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "challengeResults" JSONB NOT NULL DEFAULT '[]',
    "referenceFrameUrl" TEXT NOT NULL DEFAULT '',
    "frameUrls" JSONB NOT NULL DEFAULT '{}',
    "rejectReason" TEXT NOT NULL DEFAULT '',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "face_verification_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "face_verification_sessions_userId_createdAt_idx" ON "face_verification_sessions"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "face_verification_sessions_status_createdAt_idx" ON "face_verification_sessions"("status", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'face_verification_sessions_userId_fkey'
  ) THEN
    ALTER TABLE "face_verification_sessions" ADD CONSTRAINT "face_verification_sessions_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
