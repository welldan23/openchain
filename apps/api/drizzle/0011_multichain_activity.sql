-- Disusun ulang manual: unique (chain_id, id) di native_transfers dan token_transfers
-- harus ada sebelum foreign key komposit bridge_transfers yang memakainya.
CREATE TYPE "public"."bridge_match_status" AS ENUM('matched', 'pending', 'unmatched');--> statement-breakpoint
CREATE TABLE "bridge_transfers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bridge_transfers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source_chain_id" text NOT NULL,
	"dest_chain_id" text NOT NULL,
	"bridge_address_id" bigint NOT NULL,
	"bridge_label_id" bigint,
	"sender_address_id" bigint NOT NULL,
	"recipient_address_id" bigint,
	"sent_native_transfer_id" bigint,
	"sent_token_transfer_id" bigint,
	"received_native_transfer_id" bigint,
	"received_token_transfer_id" bigint,
	"amount_sent_raw" numeric(78, 0) NOT NULL,
	"amount_received_raw" numeric(78, 0),
	"amount_usd" numeric(30, 2),
	"status" "bridge_match_status" NOT NULL,
	"match_classification" "info_classification" DEFAULT 'heuristic' NOT NULL,
	"match_heuristic" text,
	"match_confidence" "confidence_level",
	"match_reason" text,
	"sent_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "bridge_transfers_sent_native_unique" UNIQUE("sent_native_transfer_id"),
	CONSTRAINT "bridge_transfers_sent_token_unique" UNIQUE("sent_token_transfer_id"),
	CONSTRAINT "bridge_transfers_distinct_chains" CHECK ("bridge_transfers"."source_chain_id" <> "bridge_transfers"."dest_chain_id"),
	CONSTRAINT "bridge_transfers_one_sent_transfer" CHECK (("bridge_transfers"."sent_native_transfer_id" is null) <> ("bridge_transfers"."sent_token_transfer_id" is null)),
	CONSTRAINT "bridge_transfers_at_most_one_received" CHECK ("bridge_transfers"."received_native_transfer_id" is null or "bridge_transfers"."received_token_transfer_id" is null),
	CONSTRAINT "bridge_transfers_match_is_heuristic" CHECK ("bridge_transfers"."match_classification" = 'heuristic'),
	CONSTRAINT "bridge_transfers_amount_positive" CHECK ("bridge_transfers"."amount_sent_raw" > 0 and coalesce("bridge_transfers"."amount_received_raw", 1) > 0),
	CONSTRAINT "bridge_transfers_matched_has_evidence" CHECK (("bridge_transfers"."status" = 'matched') = (coalesce("bridge_transfers"."received_native_transfer_id", "bridge_transfers"."received_token_transfer_id") is not null)),
	CONSTRAINT "bridge_transfers_matched_is_explained" CHECK ("bridge_transfers"."status" <> 'matched' or ("bridge_transfers"."match_heuristic" is not null and "bridge_transfers"."match_confidence" is not null and "bridge_transfers"."recipient_address_id" is not null and "bridge_transfers"."amount_received_raw" is not null and "bridge_transfers"."received_at" is not null)),
	CONSTRAINT "bridge_transfers_received_after_sent" CHECK ("bridge_transfers"."received_at" is null or "bridge_transfers"."received_at" >= "bridge_transfers"."sent_at")
);
--> statement-breakpoint
CREATE TABLE "multichain_chain_activity" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "multichain_chain_activity_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"scan_id" bigint NOT NULL,
	"chain_id" text NOT NULL,
	"address_id" bigint,
	"flow_scan_id" bigint,
	"status" "data_status" NOT NULL,
	"status_reason" text,
	"tx_count" integer,
	"in_usd" numeric(30, 2),
	"out_usd" numeric(30, 2),
	"counterparty_count" integer,
	"first_seen_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"native_balance_raw" numeric(78, 0),
	"balance_usd" numeric(30, 2),
	"snapshot_block" bigint,
	"fetched_at" timestamp with time zone,
	CONSTRAINT "multichain_chain_activity_scan_chain_unique" UNIQUE("scan_id","chain_id"),
	CONSTRAINT "multichain_chain_activity_unavailable_has_reason" CHECK ("multichain_chain_activity"."status" <> 'unavailable' or "multichain_chain_activity"."status_reason" is not null),
	CONSTRAINT "multichain_chain_activity_partial_has_reason" CHECK ("multichain_chain_activity"."status" <> 'partial' or "multichain_chain_activity"."status_reason" is not null),
	CONSTRAINT "multichain_chain_activity_unavailable_has_no_numbers" CHECK ("multichain_chain_activity"."status" <> 'unavailable' or ("multichain_chain_activity"."tx_count" is null and "multichain_chain_activity"."in_usd" is null and "multichain_chain_activity"."out_usd" is null and "multichain_chain_activity"."counterparty_count" is null)),
	CONSTRAINT "multichain_chain_activity_counts_non_negative" CHECK (coalesce("multichain_chain_activity"."tx_count", 0) >= 0 and coalesce("multichain_chain_activity"."counterparty_count", 0) >= 0 and coalesce("multichain_chain_activity"."in_usd", 0) >= 0 and coalesce("multichain_chain_activity"."out_usd", 0) >= 0 and coalesce("multichain_chain_activity"."native_balance_raw", 0) >= 0 and coalesce("multichain_chain_activity"."balance_usd", 0) >= 0),
	CONSTRAINT "multichain_chain_activity_seen_order" CHECK ("multichain_chain_activity"."first_seen_at" is null or "multichain_chain_activity"."last_seen_at" is null or "multichain_chain_activity"."first_seen_at" <= "multichain_chain_activity"."last_seen_at")
);
--> statement-breakpoint
CREATE TABLE "multichain_scans" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "multichain_scans_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"family" "chain_family" NOT NULL,
	"address" text NOT NULL,
	"address_normalized" text NOT NULL,
	"window_from" timestamp with time zone NOT NULL,
	"window_to" timestamp with time zone NOT NULL,
	"status" "data_status" NOT NULL,
	"status_reason" text,
	"missing_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"scanned_at" timestamp with time zone NOT NULL,
	CONSTRAINT "multichain_scans_window" CHECK ("multichain_scans"."window_from" <= "multichain_scans"."window_to"),
	CONSTRAINT "multichain_scans_unavailable_has_reason" CHECK ("multichain_scans"."status" <> 'unavailable' or "multichain_scans"."status_reason" is not null),
	CONSTRAINT "multichain_scans_partial_is_explained" CHECK ("multichain_scans"."status" <> 'partial' or "multichain_scans"."status_reason" is not null or cardinality("multichain_scans"."missing_fields") > 0)
);
--> statement-breakpoint
ALTER TABLE "token_transfers" ADD CONSTRAINT "token_transfers_chain_id_unique" UNIQUE("chain_id","id");--> statement-breakpoint
ALTER TABLE "native_transfers" ADD CONSTRAINT "native_transfers_chain_id_unique" UNIQUE("chain_id","id");--> statement-breakpoint
ALTER TABLE "bridge_transfers" ADD CONSTRAINT "bridge_transfers_source_chain_id_chains_id_fk" FOREIGN KEY ("source_chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_transfers" ADD CONSTRAINT "bridge_transfers_dest_chain_id_chains_id_fk" FOREIGN KEY ("dest_chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_transfers" ADD CONSTRAINT "bridge_transfers_bridge_label_id_labels_id_fk" FOREIGN KEY ("bridge_label_id") REFERENCES "public"."labels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_transfers" ADD CONSTRAINT "bridge_transfers_bridge_fk" FOREIGN KEY ("source_chain_id","bridge_address_id") REFERENCES "public"."addresses"("chain_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_transfers" ADD CONSTRAINT "bridge_transfers_sender_fk" FOREIGN KEY ("source_chain_id","sender_address_id") REFERENCES "public"."addresses"("chain_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_transfers" ADD CONSTRAINT "bridge_transfers_recipient_fk" FOREIGN KEY ("dest_chain_id","recipient_address_id") REFERENCES "public"."addresses"("chain_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_transfers" ADD CONSTRAINT "bridge_transfers_sent_native_fk" FOREIGN KEY ("source_chain_id","sent_native_transfer_id") REFERENCES "public"."native_transfers"("chain_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_transfers" ADD CONSTRAINT "bridge_transfers_sent_token_fk" FOREIGN KEY ("source_chain_id","sent_token_transfer_id") REFERENCES "public"."token_transfers"("chain_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_transfers" ADD CONSTRAINT "bridge_transfers_received_native_fk" FOREIGN KEY ("dest_chain_id","received_native_transfer_id") REFERENCES "public"."native_transfers"("chain_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_transfers" ADD CONSTRAINT "bridge_transfers_received_token_fk" FOREIGN KEY ("dest_chain_id","received_token_transfer_id") REFERENCES "public"."token_transfers"("chain_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multichain_chain_activity" ADD CONSTRAINT "multichain_chain_activity_scan_id_multichain_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."multichain_scans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multichain_chain_activity" ADD CONSTRAINT "multichain_chain_activity_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multichain_chain_activity" ADD CONSTRAINT "multichain_chain_activity_flow_scan_id_address_flow_scans_id_fk" FOREIGN KEY ("flow_scan_id") REFERENCES "public"."address_flow_scans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multichain_chain_activity" ADD CONSTRAINT "multichain_chain_activity_chain_address_fk" FOREIGN KEY ("chain_id","address_id") REFERENCES "public"."addresses"("chain_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bridge_transfers_sender_idx" ON "bridge_transfers" USING btree ("sender_address_id","sent_at");--> statement-breakpoint
CREATE INDEX "bridge_transfers_recipient_idx" ON "bridge_transfers" USING btree ("recipient_address_id","received_at");--> statement-breakpoint
CREATE INDEX "multichain_scans_address_idx" ON "multichain_scans" USING btree ("family","address_normalized","scanned_at");