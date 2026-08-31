CREATE TABLE "intervention_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"pair" text NOT NULL,
	"predicted_delta" real NOT NULL,
	"observed_delta" real NOT NULL,
	"adherence" real,
	"projection_id" uuid,
	"at" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"code" text NOT NULL,
	"made_at" date NOT NULL,
	"horizon_weeks" integer NOT NULL,
	"from_value" real NOT NULL,
	"expected" real NOT NULL,
	"low" real NOT NULL,
	"high" real NOT NULL,
	"contributions" jsonb NOT NULL,
	"assumptions" jsonb,
	"retest_at" date NOT NULL,
	"resolved_value" real,
	"resolved_at" date,
	"verdict" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "intervention_outcomes" ADD CONSTRAINT "intervention_outcomes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention_outcomes" ADD CONSTRAINT "intervention_outcomes_projection_id_projections_id_fk" FOREIGN KEY ("projection_id") REFERENCES "public"."projections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projections" ADD CONSTRAINT "projections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intervention_outcomes_pair_idx" ON "intervention_outcomes" USING btree ("pair");--> statement-breakpoint
CREATE INDEX "projections_user_idx" ON "projections" USING btree ("user_id","code","made_at");