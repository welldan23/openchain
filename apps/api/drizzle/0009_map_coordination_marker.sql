ALTER TABLE "wallet_maps" ADD COLUMN "coordinated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wallet_maps" ADD COLUMN "coordination_heuristic" text;--> statement-breakpoint
ALTER TABLE "wallet_maps" ADD CONSTRAINT "wallet_maps_coordination_complete" CHECK (("wallet_maps"."coordinated_at" is null) = ("wallet_maps"."coordination_heuristic" is null));