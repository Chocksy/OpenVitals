CREATE TABLE "calibration_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"condition_id" text NOT NULL,
	"predicted" real NOT NULL,
	"predicted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved" real,
	"resolved_at" timestamp with time zone,
	"resolver" text NOT NULL,
	CONSTRAINT "calibration_events_key" UNIQUE("user_id","condition_id","resolver")
);
--> statement-breakpoint
CREATE TABLE "hkb_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"summary" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"condition_id" text NOT NULL,
	"ring_woken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trigger" text NOT NULL,
	"trigger_detail" jsonb,
	"status" text DEFAULT 'awake' NOT NULL,
	"note" text,
	CONSTRAINT "user_conditions_key" UNIQUE("user_id","condition_id")
);
--> statement-breakpoint
ALTER TABLE "belief_snapshots" ADD COLUMN "kb_revision" integer;--> statement-breakpoint
ALTER TABLE "hkb_conditions" ADD COLUMN "ring" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "hkb_evidence" ADD COLUMN "correlation_group" text;--> statement-breakpoint
ALTER TABLE "calibration_events" ADD CONSTRAINT "calibration_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_conditions" ADD CONSTRAINT "user_conditions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_conditions" ADD CONSTRAINT "user_conditions_condition_id_hkb_conditions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."hkb_conditions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calibration_events_condition_idx" ON "calibration_events" USING btree ("condition_id");--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hkb_terms_name_trgm_idx" ON "hkb_terms" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hkb_conditions_ring_idx" ON "hkb_conditions" USING btree ("ring");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_conditions_user_idx" ON "user_conditions" USING btree ("user_id","status");
