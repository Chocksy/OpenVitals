CREATE TABLE "daily_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"sleep_hours" real,
	"weight_kg" real,
	"steps" integer,
	"exercise_min" integer,
	"alcohol_units" real,
	"energy" integer,
	"mood" integer,
	"fasting_hours" real,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "daily_logs_user_day_key" UNIQUE("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"metric_code" text NOT NULL,
	"target_low" real,
	"target_high" real,
	"due" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"achieved_at" timestamp with time zone,
	CONSTRAINT "goals_user_metric_key" UNIQUE("user_id","metric_code")
);
--> statement-breakpoint
CREATE TABLE "habit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"day" date NOT NULL,
	"done" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "habit_logs_item_day_key" UNIQUE("item_id","day")
);
--> statement-breakpoint
CREATE TABLE "protocol_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"text" text NOT NULL,
	"why" text,
	"metric_codes" jsonb,
	"source_insight_id" uuid,
	"cadence" text DEFAULT 'daily' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_metric_code_metrics_code_fk" FOREIGN KEY ("metric_code") REFERENCES "public"."metrics"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_item_id_protocol_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."protocol_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocol_items" ADD CONSTRAINT "protocol_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocol_items" ADD CONSTRAINT "protocol_items_source_insight_id_simple_insights_id_fk" FOREIGN KEY ("source_insight_id") REFERENCES "public"."simple_insights"("id") ON DELETE set null ON UPDATE no action;