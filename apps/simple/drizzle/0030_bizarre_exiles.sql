CREATE TABLE "hunches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"codes" text[] NOT NULL,
	"system" text,
	"signal" jsonb NOT NULL,
	"explanations" jsonb,
	"question" jsonb,
	"answer" text,
	"test" jsonb,
	"predictions" jsonb,
	"written_at" timestamp with time zone,
	"state" text DEFAULT 'open' NOT NULL,
	"outcome" text,
	"outcome_line" text,
	"seen_at" timestamp with time zone,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hunches_user_key" UNIQUE("user_id","key")
);
--> statement-breakpoint
ALTER TABLE "hunches" ADD CONSTRAINT "hunches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;