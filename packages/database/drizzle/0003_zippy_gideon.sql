CREATE TABLE "integration_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" varchar(50) NOT NULL,
	"provider_user_id" varchar(255),
	"access_token_enc" text,
	"refresh_token_enc" text,
	"token_expires_at" timestamp,
	"scopes" text,
	"last_sync_at" timestamp,
	"last_sync_cursor" text,
	"last_sync_error" text,
	"is_active" boolean DEFAULT true,
	"metadata_json" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "integration_connections_user_provider_uniq" UNIQUE("user_id","provider")
);
--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;