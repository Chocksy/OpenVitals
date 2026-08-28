CREATE TABLE "belief_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"beliefs" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "belief_snapshots" ADD CONSTRAINT "belief_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "belief_snapshots_user_at_idx" ON "belief_snapshots" USING btree ("user_id","computed_at");