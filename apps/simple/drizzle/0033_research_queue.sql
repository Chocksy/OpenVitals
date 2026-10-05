CREATE TABLE "hkb_research_queue" (
	"condition_id" text PRIMARY KEY NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL
);
