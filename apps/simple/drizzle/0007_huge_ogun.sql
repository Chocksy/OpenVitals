CREATE TABLE "hkb_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"disease_id" text NOT NULL,
	"disease_name" text,
	"hpo_id" text NOT NULL,
	"frequency" text,
	"onset" text,
	"source" text,
	CONSTRAINT "hkb_annotations_key" UNIQUE("disease_id","hpo_id","frequency")
);
--> statement-breakpoint
CREATE TABLE "hkb_import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"script" text NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now(),
	"rows" jsonb,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "hkb_terms" (
	"id" text PRIMARY KEY NOT NULL,
	"ontology" text NOT NULL,
	"name" text NOT NULL,
	"synonyms" jsonb,
	"parents" jsonb,
	"xrefs" jsonb
);
--> statement-breakpoint
ALTER TABLE "hkb_conditions" ADD COLUMN "mondo_id" text;--> statement-breakpoint
ALTER TABLE "hkb_conditions" ADD COLUMN "why" text;--> statement-breakpoint
CREATE INDEX "hkb_annotations_disease_idx" ON "hkb_annotations" USING btree ("disease_id");--> statement-breakpoint
CREATE INDEX "hkb_terms_ontology_idx" ON "hkb_terms" USING btree ("ontology");