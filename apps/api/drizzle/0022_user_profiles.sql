CREATE TABLE "user_profiles" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"avatar_data" "bytea",
	"avatar_content_type" text,
	"avatar_size" integer,
	"avatar_sha256" text,
	"avatar_updated_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_profiles_display_name_length" CHECK (length(btrim("user_profiles"."display_name")) between 2 and 60 and "user_profiles"."display_name" = btrim("user_profiles"."display_name")),
	CONSTRAINT "user_profiles_timezone_length" CHECK (length("user_profiles"."timezone") between 1 and 64),
	CONSTRAINT "user_profiles_avatar_complete" CHECK (("user_profiles"."avatar_data" is null) = ("user_profiles"."avatar_content_type" is null) and ("user_profiles"."avatar_data" is null) = ("user_profiles"."avatar_size" is null) and ("user_profiles"."avatar_data" is null) = ("user_profiles"."avatar_sha256" is null) and ("user_profiles"."avatar_data" is null) = ("user_profiles"."avatar_updated_at" is null)),
	CONSTRAINT "user_profiles_avatar_type" CHECK ("user_profiles"."avatar_content_type" is null or "user_profiles"."avatar_content_type" in ('image/png', 'image/jpeg', 'image/webp')),
	CONSTRAINT "user_profiles_avatar_size" CHECK ("user_profiles"."avatar_size" is null or ("user_profiles"."avatar_size" between 1 and 2097152 and "user_profiles"."avatar_size" = octet_length("user_profiles"."avatar_data"))),
	CONSTRAINT "user_profiles_avatar_hash" CHECK ("user_profiles"."avatar_sha256" is null or "user_profiles"."avatar_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_display_name_length";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_timezone_length";--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Salin nama dan zona waktu akun yang sudah ada sebelum kolom lamanya dihapus.
INSERT INTO "user_profiles" ("user_id", "display_name", "timezone", "updated_at")
SELECT "id", "display_name", "timezone", "updated_at" FROM "users"
ON CONFLICT ("user_id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "display_name";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "timezone";