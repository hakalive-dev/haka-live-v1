-- Self-service account deletion (anonymize-in-place): marks when PII was stripped.
ALTER TABLE "users" ADD COLUMN "deletedAt" TIMESTAMP(3);
