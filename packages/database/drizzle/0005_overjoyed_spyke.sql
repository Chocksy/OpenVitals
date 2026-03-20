CREATE TABLE "optimal_ranges" (
	"id" serial PRIMARY KEY NOT NULL,
	"metric_code" varchar(50) NOT NULL,
	"sex" varchar(10),
	"age_min" integer,
	"age_max" integer,
	"range_low" real,
	"range_high" real,
	"range_text" text,
	"source" varchar(255),
	"source_url" text,
	CONSTRAINT "optimal_ranges_metric_sex_age_uniq" UNIQUE("metric_code","sex","age_min","age_max")
);
--> statement-breakpoint
CREATE TABLE "user_optimal_ranges" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"metric_code" varchar(50) NOT NULL,
	"range_low" real,
	"range_high" real,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_optimal_ranges_user_metric_uniq" UNIQUE("user_id","metric_code")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "show_optimal_ranges" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "optimal_ranges" ADD CONSTRAINT "optimal_ranges_metric_code_metric_definitions_id_fk" FOREIGN KEY ("metric_code") REFERENCES "public"."metric_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_optimal_ranges" ADD CONSTRAINT "user_optimal_ranges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_optimal_ranges" ADD CONSTRAINT "user_optimal_ranges_metric_code_metric_definitions_id_fk" FOREIGN KEY ("metric_code") REFERENCES "public"."metric_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "optimal_ranges_metric_code_idx" ON "optimal_ranges" USING btree ("metric_code");