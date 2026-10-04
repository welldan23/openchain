CREATE TYPE "public"."native_transfer_kind" AS ENUM('transaction', 'internal');--> statement-breakpoint
CREATE TABLE "address_flow_scans" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "address_flow_scans_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"chain_id" text NOT NULL,
	"address_id" bigint NOT NULL,
	"block_from" bigint NOT NULL,
	"block_to" bigint NOT NULL,
	"window_from" timestamp with time zone NOT NULL,
	"window_to" timestamp with time zone NOT NULL,
	"native_scanned" boolean NOT NULL,
	"tokens_scanned" boolean NOT NULL,
	"internal_scanned" boolean NOT NULL,
	"status" "data_status" NOT NULL,
	"status_reason" text,
	"missing_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"provider_run_id" bigint,
	"scanned_at" timestamp with time zone NOT NULL,
	CONSTRAINT "address_flow_scans_block_range" CHECK ("address_flow_scans"."block_from" <= "address_flow_scans"."block_to"),
	CONSTRAINT "address_flow_scans_window" CHECK ("address_flow_scans"."window_from" <= "address_flow_scans"."window_to"),
	CONSTRAINT "address_flow_scans_complete_covers_all" CHECK ("address_flow_scans"."status" <> 'complete' or ("address_flow_scans"."native_scanned" and "address_flow_scans"."tokens_scanned" and "address_flow_scans"."internal_scanned")),
	CONSTRAINT "address_flow_scans_unavailable_has_reason" CHECK ("address_flow_scans"."status" <> 'unavailable' or "address_flow_scans"."status_reason" is not null),
	CONSTRAINT "address_flow_scans_partial_is_explained" CHECK ("address_flow_scans"."status" <> 'partial' or "address_flow_scans"."status_reason" is not null or cardinality("address_flow_scans"."missing_fields") > 0)
);
--> statement-breakpoint
CREATE TABLE "native_transfers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "native_transfers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"chain_id" text NOT NULL,
	"tx_hash" text NOT NULL,
	"kind" "native_transfer_kind" NOT NULL,
	"trace_path" text DEFAULT '' NOT NULL,
	"from_address_id" bigint NOT NULL,
	"to_address_id" bigint NOT NULL,
	"amount_raw" numeric(78, 0) NOT NULL,
	"amount_usd" numeric(30, 2),
	"block_number" bigint NOT NULL,
	"block_timestamp" timestamp with time zone NOT NULL,
	"provider_run_id" bigint,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "native_transfers_identity_unique" UNIQUE("chain_id","tx_hash","kind","trace_path"),
	CONSTRAINT "native_transfers_amount_positive" CHECK ("native_transfers"."amount_raw" > 0),
	CONSTRAINT "native_transfers_usd_non_negative" CHECK ("native_transfers"."amount_usd" is null or "native_transfers"."amount_usd" >= 0),
	CONSTRAINT "native_transfers_trace_path_matches_kind" CHECK (("native_transfers"."kind" = 'transaction') = ("native_transfers"."trace_path" = ''))
);
--> statement-breakpoint
ALTER TABLE "token_transfers" ADD COLUMN "amount_usd" numeric(30, 2);--> statement-breakpoint
ALTER TABLE "address_flow_scans" ADD CONSTRAINT "address_flow_scans_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "address_flow_scans" ADD CONSTRAINT "address_flow_scans_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "address_flow_scans" ADD CONSTRAINT "address_flow_scans_provider_run_id_provider_runs_id_fk" FOREIGN KEY ("provider_run_id") REFERENCES "public"."provider_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "address_flow_scans" ADD CONSTRAINT "address_flow_scans_chain_address_fk" FOREIGN KEY ("chain_id","address_id") REFERENCES "public"."addresses"("chain_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_transfers" ADD CONSTRAINT "native_transfers_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_transfers" ADD CONSTRAINT "native_transfers_from_address_id_addresses_id_fk" FOREIGN KEY ("from_address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_transfers" ADD CONSTRAINT "native_transfers_to_address_id_addresses_id_fk" FOREIGN KEY ("to_address_id") REFERENCES "public"."addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_transfers" ADD CONSTRAINT "native_transfers_provider_run_id_provider_runs_id_fk" FOREIGN KEY ("provider_run_id") REFERENCES "public"."provider_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_transfers" ADD CONSTRAINT "native_transfers_chain_from_fk" FOREIGN KEY ("chain_id","from_address_id") REFERENCES "public"."addresses"("chain_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_transfers" ADD CONSTRAINT "native_transfers_chain_to_fk" FOREIGN KEY ("chain_id","to_address_id") REFERENCES "public"."addresses"("chain_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "address_flow_scans_address_time_idx" ON "address_flow_scans" USING btree ("address_id","chain_id","scanned_at");--> statement-breakpoint
CREATE INDEX "native_transfers_from_time_idx" ON "native_transfers" USING btree ("from_address_id","block_timestamp");--> statement-breakpoint
CREATE INDEX "native_transfers_to_time_idx" ON "native_transfers" USING btree ("to_address_id","block_timestamp");--> statement-breakpoint
CREATE INDEX "native_transfers_chain_block_idx" ON "native_transfers" USING btree ("chain_id","block_number");--> statement-breakpoint
ALTER TABLE "token_transfers" ADD CONSTRAINT "token_transfers_chain_from_fk" FOREIGN KEY ("chain_id","from_address_id") REFERENCES "public"."addresses"("chain_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_transfers" ADD CONSTRAINT "token_transfers_chain_to_fk" FOREIGN KEY ("chain_id","to_address_id") REFERENCES "public"."addresses"("chain_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "token_transfers_from_time_idx" ON "token_transfers" USING btree ("from_address_id","block_timestamp");--> statement-breakpoint
CREATE INDEX "token_transfers_to_time_idx" ON "token_transfers" USING btree ("to_address_id","block_timestamp");--> statement-breakpoint
ALTER TABLE "token_transfers" ADD CONSTRAINT "token_transfers_usd_non_negative" CHECK ("token_transfers"."amount_usd" is null or "token_transfers"."amount_usd" >= 0);