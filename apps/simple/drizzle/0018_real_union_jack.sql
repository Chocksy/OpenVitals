CREATE TABLE "checkin_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"text" text NOT NULL,
	"chips" jsonb NOT NULL,
	"follow_up" jsonb,
	"reply" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "profile_fact_history" ADD COLUMN "confirmations" jsonb;--> statement-breakpoint
ALTER TABLE "profile_facts" ADD COLUMN "revisit_at" date;--> statement-breakpoint
ALTER TABLE "profile_facts" ADD COLUMN "confirmed_at" date;--> statement-breakpoint
ALTER TABLE "checkin_posts" ADD CONSTRAINT "checkin_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkin_posts_user_idx" ON "checkin_posts" USING btree ("user_id","created_at");