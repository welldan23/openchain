CREATE TYPE "public"."case_status" AS ENUM('open', 'monitoring', 'closed');--> statement-breakpoint
CREATE TYPE "public"."case_subject_kind" AS ENUM('token', 'address');--> statement-breakpoint
CREATE TYPE "public"."investigation_kind" AS ENUM('token', 'flow', 'trace', 'map', 'multichain');--> statement-breakpoint
CREATE TABLE "case_finding_evidence" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "case_finding_evidence_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"finding_id" bigint NOT NULL,
	"chain_id" text NOT NULL,
	"tx_hash" text NOT NULL,
	CONSTRAINT "case_finding_evidence_unique" UNIQUE("finding_id","chain_id","tx_hash")
);
--> statement-breakpoint
CREATE TABLE "case_findings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "case_findings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"case_id" bigint NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"classification" "info_classification" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"added_at" timestamp with time zone NOT NULL,
	CONSTRAINT "case_findings_key_unique" UNIQUE("case_id","key"),
	CONSTRAINT "case_findings_classification_is_claim" CHECK ("case_findings"."classification" <> 'unavailable')
);
--> statement-breakpoint
CREATE TABLE "case_notes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "case_notes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"case_id" bigint NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "case_notes_body_length" CHECK (length(btrim("case_notes"."body")) > 0 and length("case_notes"."body") <= 280)
);
--> statement-breakpoint
CREATE TABLE "case_snapshot_blocks" (
	"case_id" bigint NOT NULL,
	"chain_id" text NOT NULL,
	"block_number" bigint NOT NULL,
	CONSTRAINT "case_snapshot_blocks_unique" UNIQUE("case_id","chain_id"),
	CONSTRAINT "case_snapshot_blocks_positive" CHECK ("case_snapshot_blocks"."block_number" >= 0)
);
--> statement-breakpoint
CREATE TABLE "case_steps" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "case_steps_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"case_id" bigint NOT NULL,
	"kind" "investigation_kind" NOT NULL,
	"title" text NOT NULL,
	"chain_id" text,
	"href" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	CONSTRAINT "case_steps_href_unique" UNIQUE("case_id","href"),
	CONSTRAINT "case_steps_href_is_investigation" CHECK ("case_steps"."href" ~ '^/(token|flow|trace|map|multichain)/' and starts_with("case_steps"."href", '/' || "case_steps"."kind"::text || '/'))
);
--> statement-breakpoint
CREATE TABLE "case_subjects" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "case_subjects_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"case_id" bigint NOT NULL,
	"kind" "case_subject_kind" NOT NULL,
	"chain_id" text,
	"address" text NOT NULL,
	"address_normalized" text NOT NULL,
	"address_id" bigint,
	"title" text NOT NULL,
	"href" text NOT NULL,
	"added_at" timestamp with time zone NOT NULL,
	CONSTRAINT "case_subjects_unique" UNIQUE("case_id","kind","chain_id","address_normalized"),
	CONSTRAINT "case_subjects_address_needs_chain" CHECK ("case_subjects"."address_id" is null or "case_subjects"."chain_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"status" "case_status" DEFAULT 'open' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"data_status" "data_status" NOT NULL,
	"status_reason" text,
	"sources" text[] DEFAULT '{}'::text[] NOT NULL,
	"snapshot_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "cases_title_length" CHECK (length(btrim("cases"."title")) > 0 and length("cases"."title") <= 120),
	CONSTRAINT "cases_not_complete_is_explained" CHECK ("cases"."data_status" = 'complete' or "cases"."status_reason" is not null),
	CONSTRAINT "cases_updated_order" CHECK ("cases"."created_at" <= "cases"."updated_at")
);
--> statement-breakpoint
CREATE TABLE "investigations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "investigations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" "investigation_kind" NOT NULL,
	"title" text NOT NULL,
	"chain_id" text,
	"href" text NOT NULL,
	"note" text,
	"finding_count" integer,
	"first_opened_at" timestamp with time zone NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"open_count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "investigations_href_unique" UNIQUE("href"),
	CONSTRAINT "investigations_href_is_investigation" CHECK ("investigations"."href" ~ '^/(token|flow|trace|map|multichain)/' and starts_with("investigations"."href", '/' || "investigations"."kind"::text || '/')),
	CONSTRAINT "investigations_title_not_blank" CHECK (length(btrim("investigations"."title")) > 0),
	CONSTRAINT "investigations_note_length" CHECK ("investigations"."note" is null or (length(btrim("investigations"."note")) > 0 and length("investigations"."note") <= 280)),
	CONSTRAINT "investigations_counts" CHECK ("investigations"."open_count" >= 1 and ("investigations"."finding_count" is null or "investigations"."finding_count" >= 0)),
	CONSTRAINT "investigations_opened_order" CHECK ("investigations"."first_opened_at" <= "investigations"."opened_at")
);
--> statement-breakpoint
ALTER TABLE "case_finding_evidence" ADD CONSTRAINT "case_finding_evidence_finding_id_case_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."case_findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_finding_evidence" ADD CONSTRAINT "case_finding_evidence_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_findings" ADD CONSTRAINT "case_findings_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_snapshot_blocks" ADD CONSTRAINT "case_snapshot_blocks_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_snapshot_blocks" ADD CONSTRAINT "case_snapshot_blocks_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_steps" ADD CONSTRAINT "case_steps_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_steps" ADD CONSTRAINT "case_steps_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_subjects" ADD CONSTRAINT "case_subjects_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_subjects" ADD CONSTRAINT "case_subjects_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_subjects" ADD CONSTRAINT "case_subjects_chain_address_fk" FOREIGN KEY ("chain_id","address_id") REFERENCES "public"."addresses"("chain_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_finding_evidence_tx_idx" ON "case_finding_evidence" USING btree ("chain_id","tx_hash");--> statement-breakpoint
CREATE INDEX "cases_updated_idx" ON "cases" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "investigations_opened_idx" ON "investigations" USING btree ("opened_at");