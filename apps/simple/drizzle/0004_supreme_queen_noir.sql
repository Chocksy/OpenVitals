ALTER TABLE "uploads" ADD COLUMN "raw_text" text;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "blob_path" text;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "sha256" text;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "pages" integer;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "readings_count" integer;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "source" text DEFAULT 'upload';--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "deleted_at" timestamp with time zone;