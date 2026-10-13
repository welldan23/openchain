CREATE TABLE "report_share_links" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "report_share_links_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"report_id" bigint NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "report_share_links_token_unique" UNIQUE("token_hash"),
	CONSTRAINT "report_share_links_hash_format" CHECK ("report_share_links"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "report_share_links_prefix_length" CHECK (length("report_share_links"."token_prefix") between 4 and 12),
	CONSTRAINT "report_share_links_expiry_order" CHECK ("report_share_links"."expires_at" is null or "report_share_links"."expires_at" > "report_share_links"."created_at"),
	CONSTRAINT "report_share_links_revoked_order" CHECK ("report_share_links"."revoked_at" is null or "report_share_links"."revoked_at" >= "report_share_links"."created_at"),
	CONSTRAINT "report_share_links_views" CHECK ("report_share_links"."view_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "report_share_links" ADD CONSTRAINT "report_share_links_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_share_links_report_idx" ON "report_share_links" USING btree ("report_id");