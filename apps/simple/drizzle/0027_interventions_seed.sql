ALTER TABLE "hkb_interventions" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "hkb_interventions" ADD COLUMN "caution" text;--> statement-breakpoint
ALTER TABLE "hkb_interventions" ADD COLUMN "source" text DEFAULT 'research' NOT NULL;