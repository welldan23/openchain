CREATE TYPE "public"."density_preference" AS ENUM('comfortable', 'compact');--> statement-breakpoint
CREATE TYPE "public"."language_preference" AS ENUM('id', 'en');--> statement-breakpoint
CREATE TYPE "public"."number_locale" AS ENUM('id', 'en');--> statement-breakpoint
CREATE TYPE "public"."theme_preference" AS ENUM('system', 'dark', 'light');--> statement-breakpoint
CREATE TYPE "public"."time_display" AS ENUM('local', 'utc');--> statement-breakpoint
CREATE TYPE "public"."value_unit" AS ENUM('usd', 'native');--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"theme" "theme_preference" DEFAULT 'dark' NOT NULL,
	"language" "language_preference" DEFAULT 'id' NOT NULL,
	"number_locale" "number_locale" DEFAULT 'id' NOT NULL,
	"time_display" time_display DEFAULT 'local' NOT NULL,
	"compact_numbers" boolean DEFAULT true NOT NULL,
	"value_unit" "value_unit" DEFAULT 'usd' NOT NULL,
	"default_chain_id" text,
	"density" "density_preference" DEFAULT 'comfortable' NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_default_chain_id_chains_id_fk" FOREIGN KEY ("default_chain_id") REFERENCES "public"."chains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Akun yang sudah ada mendapat preferensi bawaan.
INSERT INTO "user_preferences" ("user_id", "updated_at")
SELECT "id", "updated_at" FROM "users"
ON CONFLICT ("user_id") DO NOTHING;
