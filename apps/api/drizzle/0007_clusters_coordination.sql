CREATE TYPE "public"."cluster_label" AS ENUM('visual_cluster', 'common_funding', 'coordinated_execution', 'bundled_or_sniper_activity', 'market_maker_possible', 'likely_linked', 'insider_or_team', 'false_positive_possible', 'inconclusive');--> statement-breakpoint
CREATE TYPE "public"."confidence_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."coordination_action" AS ENUM('funding', 'buy', 'sell', 'add_liquidity', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."coordination_kind" AS ENUM('funding_burst', 'same_block_buy', 'similar_amount', 'coordinated_sell');--> statement-breakpoint
CREATE TABLE "coordination_event_members" (
	"map_id" bigint NOT NULL,
	"event_id" bigint NOT NULL,
	"node_id" bigint NOT NULL,
	CONSTRAINT "coordination_event_members_pk" PRIMARY KEY("event_id","node_id")
);
--> statement-breakpoint
CREATE TABLE "coordination_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "coordination_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"map_id" bigint NOT NULL,
	"key" text NOT NULL,
	"kind" "coordination_kind" NOT NULL,
	"detail" text NOT NULL,
	"confidence" "confidence_level" NOT NULL,
	"classification" "info_classification" DEFAULT 'heuristic' NOT NULL,
	"heuristic_name" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"window_seconds" integer NOT NULL,
	"block_number" bigint,
	CONSTRAINT "coordination_events_map_key_unique" UNIQUE("map_id","key"),
	CONSTRAINT "coordination_events_map_id_unique" UNIQUE("map_id","id"),
	CONSTRAINT "coordination_events_is_heuristic" CHECK ("coordination_events"."classification" = 'heuristic'),
	CONSTRAINT "coordination_events_window_non_negative" CHECK ("coordination_events"."window_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "coordination_txs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "coordination_txs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"event_id" bigint NOT NULL,
	"action" "coordination_action" NOT NULL,
	"native_transfer_id" bigint,
	"token_transfer_id" bigint,
	CONSTRAINT "coordination_txs_native_unique" UNIQUE("event_id","native_transfer_id"),
	CONSTRAINT "coordination_txs_token_unique" UNIQUE("event_id","token_transfer_id"),
	CONSTRAINT "coordination_txs_one_transfer" CHECK (("coordination_txs"."native_transfer_id" is null) <> ("coordination_txs"."token_transfer_id" is null))
);
--> statement-breakpoint
CREATE TABLE "map_cluster_members" (
	"map_id" bigint NOT NULL,
	"cluster_id" bigint NOT NULL,
	"node_id" bigint NOT NULL,
	CONSTRAINT "map_cluster_members_pk" PRIMARY KEY("cluster_id","node_id"),
	CONSTRAINT "map_cluster_members_one_cluster_per_node" UNIQUE("map_id","node_id")
);
--> statement-breakpoint
CREATE TABLE "map_cluster_signal_evidence" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "map_cluster_signal_evidence_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"signal_id" bigint NOT NULL,
	"native_transfer_id" bigint,
	"token_transfer_id" bigint,
	CONSTRAINT "map_cluster_signal_evidence_native_unique" UNIQUE("signal_id","native_transfer_id"),
	CONSTRAINT "map_cluster_signal_evidence_token_unique" UNIQUE("signal_id","token_transfer_id"),
	CONSTRAINT "map_cluster_signal_evidence_one_transfer" CHECK (("map_cluster_signal_evidence"."native_transfer_id" is null) <> ("map_cluster_signal_evidence"."token_transfer_id" is null))
);
--> statement-breakpoint
CREATE TABLE "map_cluster_signals" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "map_cluster_signals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"cluster_id" bigint NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"detail" text NOT NULL,
	"matched" boolean NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "map_cluster_signals_cluster_key_unique" UNIQUE("cluster_id","key")
);
--> statement-breakpoint
CREATE TABLE "map_clusters" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "map_clusters_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"map_id" bigint NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"reason" text NOT NULL,
	"labels" "cluster_label"[] NOT NULL,
	"confidence" "confidence_level" NOT NULL,
	"caveats" text[] DEFAULT '{}'::text[] NOT NULL,
	"classification" "info_classification" DEFAULT 'heuristic' NOT NULL,
	"heuristic_name" text NOT NULL,
	"has_direct_evidence" boolean DEFAULT false NOT NULL,
	CONSTRAINT "map_clusters_map_key_unique" UNIQUE("map_id","key"),
	CONSTRAINT "map_clusters_map_id_unique" UNIQUE("map_id","id"),
	CONSTRAINT "map_clusters_is_heuristic" CHECK ("map_clusters"."classification" = 'heuristic'),
	CONSTRAINT "map_clusters_has_labels" CHECK (cardinality("map_clusters"."labels") > 0),
	CONSTRAINT "map_clusters_insider_needs_direct_evidence" CHECK (not ('insider_or_team' = any("map_clusters"."labels")) or "map_clusters"."has_direct_evidence")
);
--> statement-breakpoint
ALTER TABLE "coordination_event_members" ADD CONSTRAINT "coordination_event_members_event_fk" FOREIGN KEY ("map_id","event_id") REFERENCES "public"."coordination_events"("map_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coordination_event_members" ADD CONSTRAINT "coordination_event_members_node_fk" FOREIGN KEY ("map_id","node_id") REFERENCES "public"."map_nodes"("map_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coordination_events" ADD CONSTRAINT "coordination_events_map_id_wallet_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."wallet_maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coordination_txs" ADD CONSTRAINT "coordination_txs_event_id_coordination_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."coordination_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coordination_txs" ADD CONSTRAINT "coordination_txs_native_transfer_id_native_transfers_id_fk" FOREIGN KEY ("native_transfer_id") REFERENCES "public"."native_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coordination_txs" ADD CONSTRAINT "coordination_txs_token_transfer_id_token_transfers_id_fk" FOREIGN KEY ("token_transfer_id") REFERENCES "public"."token_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_cluster_members" ADD CONSTRAINT "map_cluster_members_cluster_fk" FOREIGN KEY ("map_id","cluster_id") REFERENCES "public"."map_clusters"("map_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_cluster_members" ADD CONSTRAINT "map_cluster_members_node_fk" FOREIGN KEY ("map_id","node_id") REFERENCES "public"."map_nodes"("map_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_cluster_signal_evidence" ADD CONSTRAINT "map_cluster_signal_evidence_signal_id_map_cluster_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."map_cluster_signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_cluster_signal_evidence" ADD CONSTRAINT "map_cluster_signal_evidence_native_transfer_id_native_transfers_id_fk" FOREIGN KEY ("native_transfer_id") REFERENCES "public"."native_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_cluster_signal_evidence" ADD CONSTRAINT "map_cluster_signal_evidence_token_transfer_id_token_transfers_id_fk" FOREIGN KEY ("token_transfer_id") REFERENCES "public"."token_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_cluster_signals" ADD CONSTRAINT "map_cluster_signals_cluster_id_map_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."map_clusters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_clusters" ADD CONSTRAINT "map_clusters_map_id_wallet_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."wallet_maps"("id") ON DELETE cascade ON UPDATE no action;