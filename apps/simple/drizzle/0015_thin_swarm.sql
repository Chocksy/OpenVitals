CREATE TABLE "journey_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_id" text NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now(),
	"kb_revision" integer,
	"result" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "journey_runs_journey_idx" ON "journey_runs" USING btree ("journey_id","ran_at");