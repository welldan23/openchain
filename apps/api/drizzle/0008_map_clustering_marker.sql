ALTER TABLE "wallet_maps" ADD COLUMN "clustered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wallet_maps" ADD COLUMN "cluster_heuristic" text;--> statement-breakpoint
ALTER TABLE "wallet_maps" ADD CONSTRAINT "wallet_maps_clustering_complete" CHECK (("wallet_maps"."clustered_at" is null) = ("wallet_maps"."cluster_heuristic" is null));