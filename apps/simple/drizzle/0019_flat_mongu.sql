ALTER TABLE "daily_logs" ADD COLUMN "nutrition" jsonb;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "wearable" jsonb;--> statement-breakpoint
ALTER TABLE "readings" ADD COLUMN "source" text;--> statement-breakpoint
CREATE UNIQUE INDEX "readings_user_metric_day_source_key" ON "readings" USING btree ("user_id","metric_code","observed_at","source") WHERE "readings"."source" is not null;