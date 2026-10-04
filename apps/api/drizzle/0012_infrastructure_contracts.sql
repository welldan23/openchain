-- Disusun ulang manual: unique labels(id, address_id) harus ada sebelum
-- foreign key komposit infrastructure_contracts yang memakainya.
CREATE TYPE "public"."infrastructure_kind" AS ENUM('bridge', 'router', 'aggregator');--> statement-breakpoint
CREATE TYPE "public"."infrastructure_role" AS ENUM('bridge_entry', 'bridge_exit', 'bridge_both', 'router');--> statement-breakpoint
CREATE TABLE "infrastructure_contracts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "infrastructure_contracts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"protocol_id" text NOT NULL,
	"chain_id" text NOT NULL,
	"address_id" bigint NOT NULL,
	"role" "infrastructure_role" NOT NULL,
	"source" "label_source" NOT NULL,
	"source_name" text NOT NULL,
	"classification" "info_classification" NOT NULL,
	"confidence" numeric(4, 3),
	"label_id" bigint,
	"provider_run_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "infrastructure_contracts_protocol_address_source_unique" UNIQUE("protocol_id","chain_id","address_id","source_name"),
	CONSTRAINT "infrastructure_contracts_classification_matches_source" CHECK (("infrastructure_contracts"."source" = 'external' and "infrastructure_contracts"."classification" = 'external_label')
        or ("infrastructure_contracts"."source" = 'heuristic' and "infrastructure_contracts"."classification" = 'heuristic')
        or ("infrastructure_contracts"."source" = 'user' and "infrastructure_contracts"."classification" = 'assumption')),
	CONSTRAINT "infrastructure_contracts_heuristic_has_confidence" CHECK ("infrastructure_contracts"."source" <> 'heuristic' or "infrastructure_contracts"."confidence" is not null),
	CONSTRAINT "infrastructure_contracts_confidence_range" CHECK ("infrastructure_contracts"."confidence" is null or ("infrastructure_contracts"."confidence" >= 0 and "infrastructure_contracts"."confidence" <= 1))
);--> statement-breakpoint
CREATE TABLE "infrastructure_protocols" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "infrastructure_kind" NOT NULL,
	"reference_url" text,
	CONSTRAINT "infrastructure_protocols_id_is_slug" CHECK ("infrastructure_protocols"."id" ~ '^[a-z0-9-]+$')
);--> statement-breakpoint
ALTER TABLE "bridge_transfers" ADD COLUMN "protocol_id" text;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_id_address_unique" UNIQUE("id","address_id");--> statement-breakpoint
ALTER TABLE "infrastructure_contracts" ADD CONSTRAINT "infrastructure_contracts_protocol_id_infrastructure_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."infrastructure_protocols"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infrastructure_contracts" ADD CONSTRAINT "infrastructure_contracts_provider_run_id_provider_runs_id_fk" FOREIGN KEY ("provider_run_id") REFERENCES "public"."provider_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infrastructure_contracts" ADD CONSTRAINT "infrastructure_contracts_chain_address_fk" FOREIGN KEY ("chain_id","address_id") REFERENCES "public"."addresses"("chain_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infrastructure_contracts" ADD CONSTRAINT "infrastructure_contracts_label_address_fk" FOREIGN KEY ("label_id","address_id") REFERENCES "public"."labels"("id","address_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "infrastructure_contracts_address_idx" ON "infrastructure_contracts" USING btree ("address_id");--> statement-breakpoint
ALTER TABLE "bridge_transfers" ADD CONSTRAINT "bridge_transfers_protocol_id_infrastructure_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."infrastructure_protocols"("id") ON DELETE no action ON UPDATE no action;
