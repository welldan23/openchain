CREATE TABLE "user_sessions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "user_sessions_token_unique" UNIQUE("token_hash"),
	CONSTRAINT "user_sessions_hash_format" CHECK ("user_sessions"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "user_sessions_expiry_order" CHECK ("user_sessions"."expires_at" > "user_sessions"."created_at"),
	CONSTRAINT "user_sessions_seen_order" CHECK ("user_sessions"."last_seen_at" >= "user_sessions"."created_at"),
	CONSTRAINT "user_sessions_revoked_order" CHECK ("user_sessions"."revoked_at" is null or "user_sessions"."revoked_at" >= "user_sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"email_normalized" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"failed_sign_ins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_sign_in_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email_normalized"),
	CONSTRAINT "users_email_normalized" CHECK ("users"."email_normalized" = lower(btrim("users"."email"))),
	CONSTRAINT "users_email_format" CHECK (length("users"."email") <= 254 and "users"."email_normalized" ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'),
	CONSTRAINT "users_display_name_length" CHECK (length(btrim("users"."display_name")) between 2 and 60 and "users"."display_name" = btrim("users"."display_name")),
	CONSTRAINT "users_password_is_hash" CHECK ("users"."password_hash" ~ '^scrypt\$[0-9]+\$[0-9]+\$[0-9]+\$[A-Za-z0-9_-]{16,}\$[A-Za-z0-9_-]{32,}$'),
	CONSTRAINT "users_timezone_length" CHECK (length("users"."timezone") between 1 and 64),
	CONSTRAINT "users_failed_sign_ins" CHECK ("users"."failed_sign_ins" >= 0),
	CONSTRAINT "users_updated_order" CHECK ("users"."created_at" <= "users"."updated_at")
);
--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_sessions_user_idx" ON "user_sessions" USING btree ("user_id");