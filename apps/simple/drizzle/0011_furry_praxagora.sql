CREATE TABLE "hkb_interventions" (
	"id" text PRIMARY KEY NOT NULL,
	"condition_id" text NOT NULL,
	"name" text NOT NULL,
	"dose" text,
	"duration" text,
	"outcome_feature_id" text,
	"effect" text,
	"direction" text NOT NULL,
	"grade" text NOT NULL,
	"paper" jsonb,
	"quote" text,
	"status" text DEFAULT 'accepted' NOT NULL,
	"population" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "profile_fact_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"change_kind" text NOT NULL,
	"note" text,
	"source" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "hkb_evidence" ADD COLUMN "needs_look" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hkb_features" ADD COLUMN "minted_from" text;--> statement-breakpoint
ALTER TABLE "hkb_interventions" ADD CONSTRAINT "hkb_interventions_condition_id_hkb_conditions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."hkb_conditions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_fact_history" ADD CONSTRAINT "profile_fact_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hkb_interventions_condition_idx" ON "hkb_interventions" USING btree ("condition_id");--> statement-breakpoint
CREATE INDEX "profile_fact_history_user_key_idx" ON "profile_fact_history" USING btree ("user_id","key","valid_from");