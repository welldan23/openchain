CREATE TYPE "public"."chain_family" AS ENUM('evm', 'solana', 'bitcoin', 'tron', 'ton');--> statement-breakpoint
CREATE TYPE "public"."chain_support_status" AS ENUM('planned', 'experimental', 'validated');--> statement-breakpoint
CREATE TYPE "public"."check_status" AS ENUM('fail', 'warn', 'unknown', 'pass');--> statement-breakpoint
CREATE TYPE "public"."data_status" AS ENUM('complete', 'partial', 'unavailable', 'stale');--> statement-breakpoint
CREATE TYPE "public"."entity_label_type" AS ENUM('exchange', 'router', 'bridge', 'market_maker', 'treasury', 'bot', 'whale', 'deployer', 'liquidity_pool', 'launchpad', 'faucet', 'infrastructure', 'burn', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."info_classification" AS ENUM('verified_fact', 'derived_metric', 'heuristic', 'external_label', 'assumption', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."label_source" AS ENUM('external', 'heuristic', 'user');--> statement-breakpoint
CREATE TYPE "public"."provider_kind" AS ENUM('rpc', 'explorer', 'indexed_data', 'market_data', 'entity_label', 'security');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('unknown', 'low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."risk_severity" AS ENUM('critical', 'high', 'medium', 'low', 'info');--> statement-breakpoint
CREATE TYPE "public"."token_standard" AS ENUM('erc20', 'spl', 'spl_token_2022');--> statement-breakpoint
CREATE TYPE "public"."trading_event_type" AS ENUM('deploy', 'mint', 'add_liquidity', 'remove_liquidity', 'buy', 'sell', 'transfer', 'burn');--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "addresses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"chain_id" text NOT NULL,
	"address" text NOT NULL,
	"address_normalized" text NOT NULL,
	"is_contract" boolean,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "addresses_chain_address_unique" UNIQUE("chain_id","address_normalized"),
	CONSTRAINT "addresses_chain_id_id_unique" UNIQUE("chain_id","id")
);
--> statement-breakpoint
CREATE TABLE "chains" (
	"id" text PRIMARY KEY NOT NULL,
	"family" "chain_family" NOT NULL,
	"evm_chain_id" integer,
	"name" text NOT NULL,
	"native_symbol" text NOT NULL,
	"explorer_url" text,
	"support_status" "chain_support_status" DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chains_evm_chain_id_unique" UNIQUE("evm_chain_id"),
	CONSTRAINT "chains_id_is_slug" CHECK ("chains"."id" ~ '^[a-z0-9-]+$'),
	CONSTRAINT "chains_evm_chain_id_matches_family" CHECK (("chains"."family" = 'evm') = ("chains"."evm_chain_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "labels_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"address_id" bigint NOT NULL,
	"label_type" "entity_label_type" NOT NULL,
	"name" text,
	"source" "label_source" NOT NULL,
	"source_name" text NOT NULL,
	"classification" "info_classification" NOT NULL,
	"confidence" numeric(4, 3),
	"provider_run_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "labels_address_type_source_unique" UNIQUE("address_id","label_type","source_name"),
	CONSTRAINT "labels_confidence_range" CHECK ("labels"."confidence" is null or ("labels"."confidence" >= 0 and "labels"."confidence" <= 1)),
	CONSTRAINT "labels_classification_matches_source" CHECK (("labels"."source" = 'external' and "labels"."classification" = 'external_label')
        or ("labels"."source" = 'heuristic' and "labels"."classification" = 'heuristic')
        or ("labels"."source" = 'user' and "labels"."classification" = 'assumption')),
	CONSTRAINT "labels_heuristic_has_confidence" CHECK ("labels"."source" <> 'heuristic' or "labels"."confidence" is not null)
);
--> statement-breakpoint
CREATE TABLE "provider_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "provider_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"provider" text NOT NULL,
	"kind" "provider_kind" NOT NULL,
	"chain_id" text,
	"operation" text NOT NULL,
	"subject" text,
	"status" "data_status" NOT NULL,
	"error_reason" text,
	"block_from" bigint,
	"block_to" bigint,
	"missing_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fetched_at" timestamp with time zone,
	CONSTRAINT "provider_runs_unavailable_has_reason" CHECK ("provider_runs"."status" <> 'unavailable' or "provider_runs"."error_reason" is not null),
	CONSTRAINT "provider_runs_partial_is_explained" CHECK ("provider_runs"."status" <> 'partial' or "provider_runs"."error_reason" is not null or cardinality("provider_runs"."missing_fields") > 0),
	CONSTRAINT "provider_runs_block_range" CHECK ("provider_runs"."block_from" is null or "provider_runs"."block_to" is null or "provider_runs"."block_from" <= "provider_runs"."block_to")
);
--> statement-breakpoint
CREATE TABLE "holders" (
	"snapshot_id" bigint NOT NULL,
	"address_id" bigint NOT NULL,
	"rank" integer NOT NULL,
	"balance_raw" numeric(78, 0) NOT NULL,
	"share_pct" numeric(9, 6) NOT NULL,
	CONSTRAINT "holders_snapshot_id_address_id_pk" PRIMARY KEY("snapshot_id","address_id"),
	CONSTRAINT "holders_snapshot_rank_unique" UNIQUE("snapshot_id","rank"),
	CONSTRAINT "holders_rank_positive" CHECK ("holders"."rank" >= 1),
	CONSTRAINT "holders_balance_non_negative" CHECK ("holders"."balance_raw" >= 0),
	CONSTRAINT "holders_share_range" CHECK ("holders"."share_pct" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "token_snapshot_sources" (
	"snapshot_id" bigint NOT NULL,
	"provider_run_id" bigint NOT NULL,
	CONSTRAINT "token_snapshot_sources_snapshot_id_provider_run_id_pk" PRIMARY KEY("snapshot_id","provider_run_id")
);
--> statement-breakpoint
CREATE TABLE "token_snapshots" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "token_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"token_id" bigint NOT NULL,
	"block_number" bigint NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"data_status" "data_status" NOT NULL,
	"price_usd" numeric(38, 18),
	"price_change_24h_pct" numeric(12, 4),
	"market_cap_usd" numeric(30, 2),
	"fdv_usd" numeric(30, 2),
	"liquidity_usd" numeric(30, 2),
	"volume_24h_usd" numeric(30, 2),
	"holder_count" integer,
	"tx_count_24h" integer,
	"top10_pct" numeric(7, 4),
	"top50_pct" numeric(7, 4),
	"risk_score" smallint,
	"risk_level" "risk_level" DEFAULT 'unknown' NOT NULL,
	CONSTRAINT "token_snapshots_token_block_unique" UNIQUE("token_id","block_number"),
	CONSTRAINT "token_snapshots_pct_range" CHECK (("token_snapshots"."top10_pct" is null or "token_snapshots"."top10_pct" between 0 and 100)
        and ("token_snapshots"."top50_pct" is null or "token_snapshots"."top50_pct" between 0 and 100)),
	CONSTRAINT "token_snapshots_top10_within_top50" CHECK ("token_snapshots"."top10_pct" is null or "token_snapshots"."top50_pct" is null or "token_snapshots"."top10_pct" <= "token_snapshots"."top50_pct"),
	CONSTRAINT "token_snapshots_risk_score_range" CHECK ("token_snapshots"."risk_score" is null or "token_snapshots"."risk_score" between 0 and 100),
	CONSTRAINT "token_snapshots_unknown_risk_has_no_score" CHECK (("token_snapshots"."risk_level" = 'unknown') = ("token_snapshots"."risk_score" is null)),
	CONSTRAINT "token_snapshots_counts_non_negative" CHECK (("token_snapshots"."holder_count" is null or "token_snapshots"."holder_count" >= 0)
        and ("token_snapshots"."tx_count_24h" is null or "token_snapshots"."tx_count_24h" >= 0))
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tokens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"chain_id" text NOT NULL,
	"address_id" bigint NOT NULL,
	"standard" "token_standard" NOT NULL,
	"name" text,
	"symbol" text,
	"decimals" smallint,
	"total_supply_raw" numeric(78, 0),
	"deployer_address_id" bigint,
	"deploy_tx_hash" text,
	"deployed_at" timestamp with time zone,
	"source_verified" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tokens_address_unique" UNIQUE("address_id"),
	CONSTRAINT "tokens_decimals_range" CHECK ("tokens"."decimals" is null or ("tokens"."decimals" >= 0 and "tokens"."decimals" <= 255)),
	CONSTRAINT "tokens_total_supply_non_negative" CHECK ("tokens"."total_supply_raw" is null or "tokens"."total_supply_raw" >= 0)
);
--> statement-breakpoint
CREATE TABLE "token_transfers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "token_transfers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"chain_id" text NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"token_id" bigint NOT NULL,
	"from_address_id" bigint NOT NULL,
	"to_address_id" bigint NOT NULL,
	"amount_raw" numeric(78, 0) NOT NULL,
	"block_number" bigint NOT NULL,
	"block_timestamp" timestamp with time zone NOT NULL,
	"provider_run_id" bigint,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "token_transfers_chain_tx_log_unique" UNIQUE("chain_id","tx_hash","log_index"),
	CONSTRAINT "token_transfers_log_index_non_negative" CHECK ("token_transfers"."log_index" >= 0),
	CONSTRAINT "token_transfers_amount_non_negative" CHECK ("token_transfers"."amount_raw" >= 0)
);
--> statement-breakpoint
CREATE TABLE "trading_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "trading_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"chain_id" text NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer,
	"type" "trading_event_type" NOT NULL,
	"token_id" bigint NOT NULL,
	"from_address_id" bigint,
	"to_address_id" bigint,
	"amount_raw" numeric(78, 0) NOT NULL,
	"amount_usd" numeric(30, 2),
	"dex" text,
	"pair_address_id" bigint,
	"block_number" bigint NOT NULL,
	"block_timestamp" timestamp with time zone NOT NULL,
	"provider_run_id" bigint,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "trading_events_identity_unique" UNIQUE NULLS NOT DISTINCT("chain_id","tx_hash","log_index","type"),
	CONSTRAINT "trading_events_amount_non_negative" CHECK ("trading_events"."amount_raw" >= 0)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"chain_id" text NOT NULL,
	"hash" text NOT NULL,
	"block_number" bigint NOT NULL,
	"block_timestamp" timestamp with time zone NOT NULL,
	"from_address_id" bigint,
	"to_address_id" bigint,
	"value_raw" numeric(78, 0),
	"method" text,
	"success" boolean,
	"provider_run_id" bigint,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "transactions_chain_hash_unique" UNIQUE("chain_id","hash"),
	CONSTRAINT "transactions_value_non_negative" CHECK ("transactions"."value_raw" is null or "transactions"."value_raw" >= 0)
);
--> statement-breakpoint
CREATE TABLE "contract_check_evidence" (
	"check_id" bigint NOT NULL,
	"evidence_id" bigint NOT NULL,
	CONSTRAINT "contract_check_evidence_check_id_evidence_id_pk" PRIMARY KEY("check_id","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "contract_checks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contract_checks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"snapshot_id" bigint NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"status" "check_status" NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"classification" "info_classification",
	CONSTRAINT "contract_checks_snapshot_code_unique" UNIQUE("snapshot_id","code"),
	CONSTRAINT "contract_checks_unknown_has_no_classification" CHECK (("contract_checks"."status" = 'unknown') = ("contract_checks"."classification" is null))
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "evidence_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"evidence_key" text NOT NULL,
	"chain_id" text NOT NULL,
	"classification" "info_classification" NOT NULL,
	"explanation" text NOT NULL,
	"tx_hash" text,
	"block_number" bigint,
	"block_timestamp" timestamp with time zone,
	"log_index" integer,
	"source_address_id" bigint,
	"destination_address_id" bigint,
	"asset" text,
	"amount_raw" numeric(78, 0),
	"contract_address_id" bigint,
	"method" text,
	"heuristic_name" text,
	"confidence" numeric(4, 3),
	"provider_run_id" bigint,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "evidence_evidence_key_unique" UNIQUE("evidence_key"),
	CONSTRAINT "evidence_confidence_range" CHECK ("evidence"."confidence" is null or ("evidence"."confidence" >= 0 and "evidence"."confidence" <= 1)),
	CONSTRAINT "evidence_fact_is_anchored" CHECK ("evidence"."classification" <> 'verified_fact' or "evidence"."tx_hash" is not null or "evidence"."block_number" is not null),
	CONSTRAINT "evidence_heuristic_is_explained" CHECK ("evidence"."classification" <> 'heuristic' or ("evidence"."heuristic_name" is not null and "evidence"."confidence" is not null)),
	CONSTRAINT "evidence_external_label_has_provider" CHECK ("evidence"."classification" <> 'external_label' or "evidence"."provider_run_id" is not null),
	CONSTRAINT "evidence_amount_non_negative" CHECK ("evidence"."amount_raw" is null or "evidence"."amount_raw" >= 0)
);
--> statement-breakpoint
CREATE TABLE "label_evidence" (
	"label_id" bigint NOT NULL,
	"evidence_id" bigint NOT NULL,
	CONSTRAINT "label_evidence_label_id_evidence_id_pk" PRIMARY KEY("label_id","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "risk_finding_evidence" (
	"finding_id" bigint NOT NULL,
	"evidence_id" bigint NOT NULL,
	CONSTRAINT "risk_finding_evidence_finding_id_evidence_id_pk" PRIMARY KEY("finding_id","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "risk_findings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "risk_findings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"snapshot_id" bigint NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"severity" "risk_severity" NOT NULL,
	"classification" "info_classification" NOT NULL,
	CONSTRAINT "risk_findings_snapshot_code_unique" UNIQUE("snapshot_id","code")
);
--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_provider_run_id_provider_runs_id_fk" FOREIGN KEY ("provider_run_id") REFERENCES "public"."provider_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_runs" ADD CONSTRAINT "provider_runs_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holders" ADD CONSTRAINT "holders_snapshot_id_token_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."token_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holders" ADD CONSTRAINT "holders_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_snapshot_sources" ADD CONSTRAINT "token_snapshot_sources_snapshot_id_token_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."token_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_snapshot_sources" ADD CONSTRAINT "token_snapshot_sources_provider_run_id_provider_runs_id_fk" FOREIGN KEY ("provider_run_id") REFERENCES "public"."provider_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_snapshots" ADD CONSTRAINT "token_snapshots_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_deployer_address_id_addresses_id_fk" FOREIGN KEY ("deployer_address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_chain_address_fk" FOREIGN KEY ("chain_id","address_id") REFERENCES "public"."addresses"("chain_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_transfers" ADD CONSTRAINT "token_transfers_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_transfers" ADD CONSTRAINT "token_transfers_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_transfers" ADD CONSTRAINT "token_transfers_from_address_id_addresses_id_fk" FOREIGN KEY ("from_address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_transfers" ADD CONSTRAINT "token_transfers_to_address_id_addresses_id_fk" FOREIGN KEY ("to_address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_transfers" ADD CONSTRAINT "token_transfers_provider_run_id_provider_runs_id_fk" FOREIGN KEY ("provider_run_id") REFERENCES "public"."provider_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_events" ADD CONSTRAINT "trading_events_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_events" ADD CONSTRAINT "trading_events_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_events" ADD CONSTRAINT "trading_events_from_address_id_addresses_id_fk" FOREIGN KEY ("from_address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_events" ADD CONSTRAINT "trading_events_to_address_id_addresses_id_fk" FOREIGN KEY ("to_address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_events" ADD CONSTRAINT "trading_events_pair_address_id_addresses_id_fk" FOREIGN KEY ("pair_address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_events" ADD CONSTRAINT "trading_events_provider_run_id_provider_runs_id_fk" FOREIGN KEY ("provider_run_id") REFERENCES "public"."provider_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_from_address_id_addresses_id_fk" FOREIGN KEY ("from_address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_address_id_addresses_id_fk" FOREIGN KEY ("to_address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_provider_run_id_provider_runs_id_fk" FOREIGN KEY ("provider_run_id") REFERENCES "public"."provider_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_check_evidence" ADD CONSTRAINT "contract_check_evidence_check_id_contract_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."contract_checks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_check_evidence" ADD CONSTRAINT "contract_check_evidence_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_checks" ADD CONSTRAINT "contract_checks_snapshot_id_token_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."token_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_source_address_id_addresses_id_fk" FOREIGN KEY ("source_address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_destination_address_id_addresses_id_fk" FOREIGN KEY ("destination_address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_contract_address_id_addresses_id_fk" FOREIGN KEY ("contract_address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_provider_run_id_provider_runs_id_fk" FOREIGN KEY ("provider_run_id") REFERENCES "public"."provider_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label_evidence" ADD CONSTRAINT "label_evidence_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label_evidence" ADD CONSTRAINT "label_evidence_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_finding_evidence" ADD CONSTRAINT "risk_finding_evidence_finding_id_risk_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."risk_findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_finding_evidence" ADD CONSTRAINT "risk_finding_evidence_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_findings" ADD CONSTRAINT "risk_findings_snapshot_id_token_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."token_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_runs_subject_idx" ON "provider_runs" USING btree ("chain_id","subject");--> statement-breakpoint
CREATE INDEX "token_transfers_token_block_idx" ON "token_transfers" USING btree ("token_id","block_number");--> statement-breakpoint
CREATE INDEX "trading_events_token_time_idx" ON "trading_events" USING btree ("token_id","block_timestamp");--> statement-breakpoint
CREATE INDEX "transactions_chain_block_idx" ON "transactions" USING btree ("chain_id","block_number");--> statement-breakpoint
CREATE INDEX "evidence_chain_tx_idx" ON "evidence" USING btree ("chain_id","tx_hash");