CREATE TABLE "kg_edges" (
	"id" text PRIMARY KEY NOT NULL,
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	"relation" text NOT NULL,
	"strength" integer NOT NULL,
	"confidence" text NOT NULL,
	"grade" text NOT NULL,
	"basis" text NOT NULL,
	"when_" jsonb,
	"mechanism" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"source" text DEFAULT 'seed' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "kg_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"system_id" text,
	"codes" jsonb,
	"note" text,
	"source" text DEFAULT 'seed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "kg_edges" ADD CONSTRAINT "kg_edges_from_id_kg_nodes_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."kg_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_edges" ADD CONSTRAINT "kg_edges_to_id_kg_nodes_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."kg_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kg_edges_key" ON "kg_edges" USING btree ("from_id","to_id","relation",coalesce("when_"::text, ''));--> statement-breakpoint
CREATE INDEX "kg_edges_from_idx" ON "kg_edges" USING btree ("from_id");--> statement-breakpoint
CREATE INDEX "kg_edges_to_idx" ON "kg_edges" USING btree ("to_id");