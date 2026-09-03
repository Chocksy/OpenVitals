CREATE TABLE "meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"time" text,
	"photo_key" text,
	"label" text NOT NULL,
	"items" jsonb NOT NULL,
	"totals" jsonb NOT NULL,
	"moves" jsonb,
	"source" text DEFAULT 'capture' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "paper_watch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"condition_id" text NOT NULL,
	"source" text DEFAULT 'epmc' NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"journal" text,
	"url" text,
	"published_at" date,
	"grade" text,
	"finding" text,
	"abstract" text,
	"moves" jsonb,
	"found_at" timestamp with time zone DEFAULT now(),
	"seen_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	CONSTRAINT "paper_watch_user_external_key" UNIQUE("user_id","external_id")
);
--> statement-breakpoint
ALTER TABLE "protocol_items" ADD COLUMN "time_of_day" text;--> statement-breakpoint
ALTER TABLE "protocol_items" ADD COLUMN "days_of_week" smallint[];--> statement-breakpoint
ALTER TABLE "protocol_items" ADD COLUMN "dose_amount" numeric;--> statement-breakpoint
ALTER TABLE "protocol_items" ADD COLUMN "dose_unit" text;--> statement-breakpoint
ALTER TABLE "protocol_items" ADD COLUMN "with_what" text;--> statement-breakpoint
ALTER TABLE "protocol_items" ADD COLUMN "ends_at" date;--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "moved" jsonb;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_watch" ADD CONSTRAINT "paper_watch_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meals_user_day_idx" ON "meals" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "paper_watch_user_idx" ON "paper_watch" USING btree ("user_id","found_at");