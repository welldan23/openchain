CREATE TYPE "public"."report_block_kind" AS ENUM('paragraph', 'claim', 'evidence', 'note', 'entity');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('draft', 'review', 'final');--> statement-breakpoint
CREATE TABLE "report_blocks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "report_blocks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"report_id" bigint NOT NULL,
	"section_id" bigint NOT NULL,
	"kind" "report_block_kind" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"title" text,
	"body" text,
	"classification" "info_classification",
	"provider" text,
	"observed_at" timestamp with time zone,
	"chain_id" text,
	"tx_hash" text,
	"caption" text,
	"entity_kind" "case_subject_kind",
	"address" text,
	"href" text,
	"claim_block_id" bigint,
	"created_at" timestamp with time zone NOT NULL,
	"edited_at" timestamp with time zone,
	CONSTRAINT "report_blocks_paragraph" CHECK ("report_blocks"."kind" <> 'paragraph' or ("report_blocks"."body" is not null and length("report_blocks"."body") <= 5000)),
	CONSTRAINT "report_blocks_claim" CHECK ("report_blocks"."kind" <> 'claim' or ("report_blocks"."title" is not null and length(btrim("report_blocks"."title")) > 0 and length("report_blocks"."title") <= 200 and "report_blocks"."body" is not null and length("report_blocks"."body") <= 2000 and "report_blocks"."classification" is not null)),
	CONSTRAINT "report_blocks_claim_is_claim" CHECK ("report_blocks"."classification" is null or "report_blocks"."classification" <> 'unavailable'),
	CONSTRAINT "report_blocks_claim_provider_text" CHECK ("report_blocks"."provider" is null or length(btrim("report_blocks"."provider")) > 0),
	CONSTRAINT "report_blocks_evidence" CHECK ("report_blocks"."kind" <> 'evidence' or ("report_blocks"."chain_id" is not null and "report_blocks"."tx_hash" is not null and "report_blocks"."caption" is not null and length("report_blocks"."caption") <= 500)),
	CONSTRAINT "report_blocks_note" CHECK ("report_blocks"."kind" <> 'note' or ("report_blocks"."body" is not null and length(btrim("report_blocks"."body")) > 0 and length("report_blocks"."body") <= 280)),
	CONSTRAINT "report_blocks_entity" CHECK ("report_blocks"."kind" <> 'entity' or ("report_blocks"."entity_kind" is not null and "report_blocks"."address" is not null and "report_blocks"."title" is not null and length(btrim("report_blocks"."title")) > 0 and "report_blocks"."href" is not null and "report_blocks"."href" ~ '^/(token|flow|multichain)/')),
	CONSTRAINT "report_blocks_entity_token_has_chain" CHECK ("report_blocks"."entity_kind" is distinct from 'token' or "report_blocks"."chain_id" is not null),
	CONSTRAINT "report_blocks_claim_fields" CHECK ("report_blocks"."kind" = 'claim' or ("report_blocks"."classification" is null and "report_blocks"."provider" is null and "report_blocks"."observed_at" is null)),
	CONSTRAINT "report_blocks_title_fields" CHECK ("report_blocks"."kind" in ('claim', 'entity') or "report_blocks"."title" is null),
	CONSTRAINT "report_blocks_body_fields" CHECK ("report_blocks"."kind" in ('paragraph', 'claim', 'note') or "report_blocks"."body" is null),
	CONSTRAINT "report_blocks_chain_fields" CHECK ("report_blocks"."kind" in ('evidence', 'entity') or "report_blocks"."chain_id" is null),
	CONSTRAINT "report_blocks_evidence_fields" CHECK ("report_blocks"."kind" = 'evidence' or ("report_blocks"."tx_hash" is null and "report_blocks"."caption" is null)),
	CONSTRAINT "report_blocks_entity_fields" CHECK ("report_blocks"."kind" = 'entity' or ("report_blocks"."entity_kind" is null and "report_blocks"."address" is null and "report_blocks"."href" is null)),
	CONSTRAINT "report_blocks_note_fields" CHECK ("report_blocks"."kind" = 'note' or ("report_blocks"."claim_block_id" is null and "report_blocks"."edited_at" is null)),
	CONSTRAINT "report_blocks_edited_order" CHECK ("report_blocks"."edited_at" is null or "report_blocks"."edited_at" >= "report_blocks"."created_at")
);
--> statement-breakpoint
CREATE TABLE "report_claim_evidence" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "report_claim_evidence_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"block_id" bigint NOT NULL,
	"chain_id" text NOT NULL,
	"tx_hash" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "report_claim_evidence_unique" UNIQUE("block_id","chain_id","tx_hash")
);
--> statement-breakpoint
CREATE TABLE "report_sections" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "report_sections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"report_id" bigint NOT NULL,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "report_sections_report_id_unique" UNIQUE("report_id","id"),
	CONSTRAINT "report_sections_title_length" CHECK (length(btrim("report_sections"."title")) > 0 and length("report_sections"."title") <= 160)
);
--> statement-breakpoint
CREATE TABLE "report_snapshot_blocks" (
	"report_id" bigint NOT NULL,
	"chain_id" text NOT NULL,
	"block_number" bigint NOT NULL,
	CONSTRAINT "report_snapshot_blocks_unique" UNIQUE("report_id","chain_id"),
	CONSTRAINT "report_snapshot_blocks_positive" CHECK ("report_snapshot_blocks"."block_number" >= 0)
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"status" "report_status" DEFAULT 'draft' NOT NULL,
	"case_id" bigint,
	"source_title" text,
	"data_status" "data_status" NOT NULL,
	"status_reason" text,
	"sources" text[] DEFAULT '{}'::text[] NOT NULL,
	"snapshot_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"finalized_at" timestamp with time zone,
	CONSTRAINT "reports_title_length" CHECK (length(btrim("reports"."title")) > 0 and length("reports"."title") <= 160),
	CONSTRAINT "reports_summary_length" CHECK (length("reports"."summary") <= 2000),
	CONSTRAINT "reports_not_complete_is_explained" CHECK ("reports"."data_status" = 'complete' or "reports"."status_reason" is not null),
	CONSTRAINT "reports_updated_order" CHECK ("reports"."created_at" <= "reports"."updated_at"),
	CONSTRAINT "reports_finalized_when_final" CHECK (("reports"."status" = 'final') = ("reports"."finalized_at" is not null)),
	CONSTRAINT "reports_source_title_needs_text" CHECK ("reports"."source_title" is null or length(btrim("reports"."source_title")) > 0)
);
--> statement-breakpoint
ALTER TABLE "report_blocks" ADD CONSTRAINT "report_blocks_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_blocks" ADD CONSTRAINT "report_blocks_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_blocks" ADD CONSTRAINT "report_blocks_claim_block_id_report_blocks_id_fk" FOREIGN KEY ("claim_block_id") REFERENCES "public"."report_blocks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_blocks" ADD CONSTRAINT "report_blocks_section_fk" FOREIGN KEY ("report_id","section_id") REFERENCES "public"."report_sections"("report_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_claim_evidence" ADD CONSTRAINT "report_claim_evidence_block_id_report_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."report_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_claim_evidence" ADD CONSTRAINT "report_claim_evidence_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_sections" ADD CONSTRAINT "report_sections_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_snapshot_blocks" ADD CONSTRAINT "report_snapshot_blocks_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_snapshot_blocks" ADD CONSTRAINT "report_snapshot_blocks_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_blocks_order_idx" ON "report_blocks" USING btree ("section_id","position");--> statement-breakpoint
CREATE INDEX "report_blocks_tx_idx" ON "report_blocks" USING btree ("chain_id","tx_hash");--> statement-breakpoint
CREATE INDEX "report_claim_evidence_tx_idx" ON "report_claim_evidence" USING btree ("chain_id","tx_hash");--> statement-breakpoint
CREATE INDEX "report_sections_order_idx" ON "report_sections" USING btree ("report_id","position");--> statement-breakpoint
CREATE INDEX "reports_updated_idx" ON "reports" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "reports_case_idx" ON "reports" USING btree ("case_id");