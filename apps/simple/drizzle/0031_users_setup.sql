-- Phase 43A: where the setup flow stands for a person (lib/setup.ts
-- SetupState). `users` lives in db/auth-schema.ts, which drizzle-kit never
-- reads, so this column is added by hand. Null until setup is first posted.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "setup" jsonb;
