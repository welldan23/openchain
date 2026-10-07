CREATE TYPE "public"."danger_trait" AS ENUM('tax_change', 'mint_active', 'sell_blocked', 'blacklist', 'upgradeable', 'liquidity_unlocked', 'liquidity_pulled', 'holder_concentration', 'bundled_launch', 'fresh_wallet_funding', 'exchange_cashout', 'bridge_hop');--> statement-breakpoint
CREATE TYPE "public"."danger_trait_status" AS ENUM('detected', 'clear', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."risk_object_kind" AS ENUM('token', 'wallet', 'contract');--> statement-breakpoint
CREATE TABLE "risk_assessment_sources" (
	"assessment_id" bigint NOT NULL,
	"provider_run_id" bigint NOT NULL,
	CONSTRAINT "risk_assessment_sources_assessment_id_provider_run_id_pk" PRIMARY KEY("assessment_id","provider_run_id")
);
--> statement-breakpoint
CREATE TABLE "risk_assessments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "risk_assessments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"chain_id" text NOT NULL,
	"address_id" bigint NOT NULL,
	"object_kind" "risk_object_kind" NOT NULL,
	"token_snapshot_id" bigint,
	"methodology" text NOT NULL,
	"score" smallint,
	"level" "risk_level" NOT NULL,
	"data_status" "data_status" NOT NULL,
	"status_reason" text,
	"block_number" bigint NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"assessed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "risk_assessments_object_block_unique" UNIQUE("chain_id","address_id","block_number","methodology"),
	CONSTRAINT "risk_assessments_score_range" CHECK ("risk_assessments"."score" is null or "risk_assessments"."score" between 0 and 100),
	CONSTRAINT "risk_assessments_unknown_has_no_score" CHECK (("risk_assessments"."level" = 'unknown') = ("risk_assessments"."score" is null)),
	CONSTRAINT "risk_assessments_not_complete_is_explained" CHECK ("risk_assessments"."data_status" = 'complete' or "risk_assessments"."status_reason" is not null),
	CONSTRAINT "risk_assessments_token_snapshot_for_token" CHECK ("risk_assessments"."token_snapshot_id" is null or "risk_assessments"."object_kind" = 'token'),
	CONSTRAINT "risk_assessments_block_non_negative" CHECK ("risk_assessments"."block_number" >= 0)
);
--> statement-breakpoint
CREATE TABLE "risk_reason_evidence" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "risk_reason_evidence_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"reason_id" bigint NOT NULL,
	"chain_id" text NOT NULL,
	"tx_hash" text NOT NULL,
	"evidence_id" bigint,
	CONSTRAINT "risk_reason_evidence_unique" UNIQUE("reason_id","chain_id","tx_hash")
);
--> statement-breakpoint
CREATE TABLE "risk_reasons" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "risk_reasons_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"assessment_id" bigint NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"severity" "risk_severity" NOT NULL,
	"classification" "info_classification" NOT NULL,
	"points" smallint,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "risk_reasons_assessment_code_unique" UNIQUE("assessment_id","code"),
	CONSTRAINT "risk_reasons_assessment_id_unique" UNIQUE("assessment_id","id"),
	CONSTRAINT "risk_reasons_points_range" CHECK ("risk_reasons"."points" is null or "risk_reasons"."points" between 0 and 100),
	CONSTRAINT "risk_reasons_assumption_not_counted" CHECK ("risk_reasons"."classification" <> 'assumption' or "risk_reasons"."points" is null),
	CONSTRAINT "risk_reasons_classification_is_claim" CHECK ("risk_reasons"."classification" <> 'unavailable')
);
--> statement-breakpoint
CREATE TABLE "risk_trait_checks" (
	"assessment_id" bigint NOT NULL,
	"trait" "danger_trait" NOT NULL,
	"status" "danger_trait_status" NOT NULL,
	"note" text,
	"reason_id" bigint,
	"warning_id" bigint,
	CONSTRAINT "risk_trait_checks_assessment_id_trait_pk" PRIMARY KEY("assessment_id","trait"),
	CONSTRAINT "risk_trait_checks_detected_is_backed" CHECK ("risk_trait_checks"."status" <> 'detected' or "risk_trait_checks"."reason_id" is not null or "risk_trait_checks"."warning_id" is not null or "risk_trait_checks"."note" is not null),
	CONSTRAINT "risk_trait_checks_other_is_explained" CHECK ("risk_trait_checks"."status" = 'detected' or "risk_trait_checks"."note" is not null),
	CONSTRAINT "risk_trait_checks_reference_only_when_detected" CHECK ("risk_trait_checks"."status" = 'detected' or ("risk_trait_checks"."reason_id" is null and "risk_trait_checks"."warning_id" is null))
);
--> statement-breakpoint
CREATE TABLE "risk_warning_evidence" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "risk_warning_evidence_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"warning_id" bigint NOT NULL,
	"chain_id" text NOT NULL,
	"tx_hash" text NOT NULL,
	"evidence_id" bigint,
	CONSTRAINT "risk_warning_evidence_unique" UNIQUE("warning_id","chain_id","tx_hash")
);
--> statement-breakpoint
CREATE TABLE "risk_warnings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "risk_warnings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"assessment_id" bigint NOT NULL,
	"code" text NOT NULL,
	"trait" "danger_trait" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"severity" "risk_severity" NOT NULL,
	"classification" "info_classification" NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	CONSTRAINT "risk_warnings_assessment_code_unique" UNIQUE("assessment_id","code"),
	CONSTRAINT "risk_warnings_assessment_id_unique" UNIQUE("assessment_id","id"),
	CONSTRAINT "risk_warnings_classification_is_claim" CHECK ("risk_warnings"."classification" <> 'unavailable')
);
--> statement-breakpoint
ALTER TABLE "risk_assessment_sources" ADD CONSTRAINT "risk_assessment_sources_assessment_id_risk_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."risk_assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_assessment_sources" ADD CONSTRAINT "risk_assessment_sources_provider_run_id_provider_runs_id_fk" FOREIGN KEY ("provider_run_id") REFERENCES "public"."provider_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_token_snapshot_id_token_snapshots_id_fk" FOREIGN KEY ("token_snapshot_id") REFERENCES "public"."token_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_chain_address_fk" FOREIGN KEY ("chain_id","address_id") REFERENCES "public"."addresses"("chain_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_reason_evidence" ADD CONSTRAINT "risk_reason_evidence_reason_id_risk_reasons_id_fk" FOREIGN KEY ("reason_id") REFERENCES "public"."risk_reasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_reason_evidence" ADD CONSTRAINT "risk_reason_evidence_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_reason_evidence" ADD CONSTRAINT "risk_reason_evidence_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_reasons" ADD CONSTRAINT "risk_reasons_assessment_id_risk_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."risk_assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_trait_checks" ADD CONSTRAINT "risk_trait_checks_assessment_id_risk_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."risk_assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_trait_checks" ADD CONSTRAINT "risk_trait_checks_reason_fk" FOREIGN KEY ("assessment_id","reason_id") REFERENCES "public"."risk_reasons"("assessment_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_trait_checks" ADD CONSTRAINT "risk_trait_checks_warning_fk" FOREIGN KEY ("assessment_id","warning_id") REFERENCES "public"."risk_warnings"("assessment_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_warning_evidence" ADD CONSTRAINT "risk_warning_evidence_warning_id_risk_warnings_id_fk" FOREIGN KEY ("warning_id") REFERENCES "public"."risk_warnings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_warning_evidence" ADD CONSTRAINT "risk_warning_evidence_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_warning_evidence" ADD CONSTRAINT "risk_warning_evidence_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_warnings" ADD CONSTRAINT "risk_warnings_assessment_id_risk_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."risk_assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "risk_assessments_object_idx" ON "risk_assessments" USING btree ("chain_id","address_id","assessed_at");--> statement-breakpoint
CREATE INDEX "risk_reason_evidence_tx_idx" ON "risk_reason_evidence" USING btree ("chain_id","tx_hash");--> statement-breakpoint
CREATE INDEX "risk_warning_evidence_tx_idx" ON "risk_warning_evidence" USING btree ("chain_id","tx_hash");