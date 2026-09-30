-- Phase 44B: where the check-in stands (lib/checkin.ts CheckinState). users
-- lives in db/auth-schema.ts, which drizzle-kit never reads, so this column is
-- added by hand. Null until the check-in is first read.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "checkin" jsonb;
