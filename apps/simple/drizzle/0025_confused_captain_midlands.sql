ALTER TABLE "checkin_posts" ADD COLUMN "read_state" text DEFAULT 'read' NOT NULL;--> statement-breakpoint
ALTER TABLE "checkin_posts" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "checkin_posts" ADD COLUMN "read_seen_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "checkin_posts_unread_idx" ON "checkin_posts" USING btree ("user_id","read_state");