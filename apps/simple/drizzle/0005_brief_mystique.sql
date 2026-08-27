CREATE TABLE "optimal_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"metric_code" text NOT NULL,
	"low" real,
	"high" real,
	"unit" text,
	"source" text,
	"basis" text,
	"rationale" text,
	"sex" text,
	"age_band" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "optimal_overrides_user_metric_key" UNIQUE("user_id","metric_code")
);
--> statement-breakpoint
ALTER TABLE "optimal_overrides" ADD CONSTRAINT "optimal_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimal_overrides" ADD CONSTRAINT "optimal_overrides_metric_code_metrics_code_fk" FOREIGN KEY ("metric_code") REFERENCES "public"."metrics"("code") ON DELETE no action ON UPDATE no action;