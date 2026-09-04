CREATE TABLE "topic_findings" (
	"id" text PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"name" text NOT NULL,
	"dose" text,
	"duration" text,
	"outcome_text" text NOT NULL,
	"outcome_feature_id" text,
	"effect" text,
	"direction" text NOT NULL,
	"grade" text NOT NULL,
	"study_type" text NOT NULL,
	"n" integer,
	"population" text,
	"paper_external_id" text NOT NULL,
	"paper" jsonb,
	"quote" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "topic_findings_key" UNIQUE("topic","paper_external_id","outcome_text")
);
--> statement-breakpoint
CREATE TABLE "topic_watch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"topic" text NOT NULL,
	"label" text NOT NULL,
	"origin" text DEFAULT 'typed' NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "topic_watch_user_topic_key" UNIQUE("user_id","topic")
);
--> statement-breakpoint
ALTER TABLE "topic_watch" ADD CONSTRAINT "topic_watch_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topic_findings_topic_idx" ON "topic_findings" USING btree ("topic");--> statement-breakpoint
CREATE INDEX "topic_watch_user_idx" ON "topic_watch" USING btree ("user_id","created_at");