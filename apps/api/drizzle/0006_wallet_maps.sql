-- Constraint unik pada tokens/token_snapshots dipindah sebelum foreign key
-- komposit yang memakainya; urutan bawaan drizzle-kit menaruhnya sesudah.
CREATE TYPE "public"."map_edge_kind" AS ENUM('funding', 'token_transfer');--> statement-breakpoint
CREATE TYPE "public"."map_node_role" AS ENUM('holder', 'funder', 'connector');--> statement-breakpoint
CREATE TABLE "map_edges" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "map_edges_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"map_id" bigint NOT NULL,
	"from_node_id" bigint NOT NULL,
	"to_node_id" bigint NOT NULL,
	"kind" "map_edge_kind" NOT NULL,
	"native_transfer_id" bigint,
	"token_transfer_id" bigint,
	CONSTRAINT "map_edges_map_native_unique" UNIQUE("map_id","native_transfer_id"),
	CONSTRAINT "map_edges_map_token_unique" UNIQUE("map_id","token_transfer_id"),
	CONSTRAINT "map_edges_distinct_nodes" CHECK ("map_edges"."from_node_id" <> "map_edges"."to_node_id"),
	CONSTRAINT "map_edges_one_transfer" CHECK (("map_edges"."native_transfer_id" is null) <> ("map_edges"."token_transfer_id" is null)),
	CONSTRAINT "map_edges_token_kind_has_token_transfer" CHECK ("map_edges"."kind" <> 'token_transfer' or "map_edges"."token_transfer_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "map_nodes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "map_nodes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"map_id" bigint NOT NULL,
	"chain_id" text NOT NULL,
	"address_id" bigint NOT NULL,
	"role" "map_node_role" NOT NULL,
	"share_pct" numeric(9, 6) DEFAULT '0' NOT NULL,
	"is_contract" boolean,
	CONSTRAINT "map_nodes_map_address_unique" UNIQUE("map_id","address_id"),
	CONSTRAINT "map_nodes_map_id_unique" UNIQUE("map_id","id"),
	CONSTRAINT "map_nodes_share_range" CHECK ("map_nodes"."share_pct" >= 0 and "map_nodes"."share_pct" <= 100),
	CONSTRAINT "map_nodes_non_holder_has_no_share" CHECK ("map_nodes"."role" = 'holder' or "map_nodes"."share_pct" = 0)
);
--> statement-breakpoint
CREATE TABLE "wallet_maps" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wallet_maps_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"chain_id" text NOT NULL,
	"token_id" bigint NOT NULL,
	"snapshot_id" bigint,
	"block_number" bigint NOT NULL,
	"holder_limit" integer NOT NULL,
	"funding_depth" integer NOT NULL,
	"status" "data_status" NOT NULL,
	"status_reason" text,
	"missing_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"built_at" timestamp with time zone NOT NULL,
	CONSTRAINT "wallet_maps_id_chain_unique" UNIQUE("id","chain_id"),
	CONSTRAINT "wallet_maps_holder_limit_range" CHECK ("wallet_maps"."holder_limit" between 1 and 1000),
	CONSTRAINT "wallet_maps_funding_depth_range" CHECK ("wallet_maps"."funding_depth" between 0 and 5),
	CONSTRAINT "wallet_maps_unavailable_has_reason" CHECK ("wallet_maps"."status" <> 'unavailable' or "wallet_maps"."status_reason" is not null),
	CONSTRAINT "wallet_maps_partial_is_explained" CHECK ("wallet_maps"."status" <> 'partial' or "wallet_maps"."status_reason" is not null or cardinality("wallet_maps"."missing_fields") > 0)
);
--> statement-breakpoint
ALTER TABLE "token_snapshots" ADD CONSTRAINT "token_snapshots_token_id_id_unique" UNIQUE("token_id","id");--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_chain_id_id_unique" UNIQUE("chain_id","id");--> statement-breakpoint
ALTER TABLE "map_edges" ADD CONSTRAINT "map_edges_native_transfer_id_native_transfers_id_fk" FOREIGN KEY ("native_transfer_id") REFERENCES "public"."native_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_edges" ADD CONSTRAINT "map_edges_token_transfer_id_token_transfers_id_fk" FOREIGN KEY ("token_transfer_id") REFERENCES "public"."token_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_edges" ADD CONSTRAINT "map_edges_from_node_fk" FOREIGN KEY ("map_id","from_node_id") REFERENCES "public"."map_nodes"("map_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_edges" ADD CONSTRAINT "map_edges_to_node_fk" FOREIGN KEY ("map_id","to_node_id") REFERENCES "public"."map_nodes"("map_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_nodes" ADD CONSTRAINT "map_nodes_map_fk" FOREIGN KEY ("map_id","chain_id") REFERENCES "public"."wallet_maps"("id","chain_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_nodes" ADD CONSTRAINT "map_nodes_chain_address_fk" FOREIGN KEY ("chain_id","address_id") REFERENCES "public"."addresses"("chain_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_maps" ADD CONSTRAINT "wallet_maps_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_maps" ADD CONSTRAINT "wallet_maps_chain_token_fk" FOREIGN KEY ("chain_id","token_id") REFERENCES "public"."tokens"("chain_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_maps" ADD CONSTRAINT "wallet_maps_token_snapshot_fk" FOREIGN KEY ("token_id","snapshot_id") REFERENCES "public"."token_snapshots"("token_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "map_edges_map_idx" ON "map_edges" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "wallet_maps_token_built_idx" ON "wallet_maps" USING btree ("token_id","built_at");
