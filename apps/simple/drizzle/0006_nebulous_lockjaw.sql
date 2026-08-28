CREATE TABLE "hkb_condition_tests" (
	"condition_id" text NOT NULL,
	"test_id" text NOT NULL,
	CONSTRAINT "hkb_condition_tests_condition_id_test_id_pk" PRIMARY KEY("condition_id","test_id")
);
--> statement-breakpoint
CREATE TABLE "hkb_conditions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"summary" text NOT NULL,
	"management" text NOT NULL,
	"parent_id" text,
	"burden_daly" real,
	"in_catalog" boolean DEFAULT true NOT NULL,
	"lenses" jsonb NOT NULL,
	"applies_to" jsonb,
	"requires" jsonb,
	"confirm_at_lr_pos" real,
	"pattern_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hkb_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"condition_id" text NOT NULL,
	"feature_id" text NOT NULL,
	"condition_on" jsonb NOT NULL,
	"lr_pos" real NOT NULL,
	"lr_neg" real,
	"grade" text NOT NULL,
	"source" text NOT NULL,
	"population" text,
	"confounded_by" jsonb,
	"status" text DEFAULT 'accepted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "hkb_evidence_key" UNIQUE("condition_id","feature_id","condition_on")
);
--> statement-breakpoint
CREATE TABLE "hkb_features" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"unit" text,
	"how_to" text
);
--> statement-breakpoint
CREATE TABLE "hkb_prior_modifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"condition_id" text NOT NULL,
	"feature_id" text NOT NULL,
	"condition_on" jsonb NOT NULL,
	"times" real NOT NULL,
	"why" text NOT NULL,
	"grade" text,
	"source" text,
	CONSTRAINT "hkb_prior_modifiers_key" UNIQUE("condition_id","feature_id","condition_on")
);
--> statement-breakpoint
CREATE TABLE "hkb_priors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"condition_id" text NOT NULL,
	"country" text,
	"sex" text,
	"age_min" integer,
	"age_max" integer,
	"prevalence" real NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "hkb_priors_key" UNIQUE NULLS NOT DISTINCT("condition_id","country","sex","age_min","age_max")
);
--> statement-breakpoint
CREATE TABLE "hkb_tests" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"feature_ids" jsonb NOT NULL,
	"cost" integer NOT NULL,
	"cost_by_country" jsonb,
	"invasiveness" integer,
	"lr_pos" real NOT NULL,
	"lr_neg" real NOT NULL,
	"typical_pos" jsonb,
	"typical_neg" jsonb,
	"repeatable" boolean DEFAULT false NOT NULL,
	"how_to" text
);
--> statement-breakpoint
ALTER TABLE "hkb_condition_tests" ADD CONSTRAINT "hkb_condition_tests_condition_id_hkb_conditions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."hkb_conditions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hkb_condition_tests" ADD CONSTRAINT "hkb_condition_tests_test_id_hkb_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."hkb_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hkb_evidence" ADD CONSTRAINT "hkb_evidence_condition_id_hkb_conditions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."hkb_conditions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hkb_evidence" ADD CONSTRAINT "hkb_evidence_feature_id_hkb_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."hkb_features"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hkb_prior_modifiers" ADD CONSTRAINT "hkb_prior_modifiers_condition_id_hkb_conditions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."hkb_conditions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hkb_prior_modifiers" ADD CONSTRAINT "hkb_prior_modifiers_feature_id_hkb_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."hkb_features"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hkb_priors" ADD CONSTRAINT "hkb_priors_condition_id_hkb_conditions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."hkb_conditions"("id") ON DELETE cascade ON UPDATE no action;