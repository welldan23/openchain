CREATE TYPE "public"."movement_type" AS ENUM('transfer', 'mint', 'burn', 'exchange_deposit', 'exchange_withdrawal', 'bridge_out', 'bridge_in', 'dex_interaction');--> statement-breakpoint
CREATE TABLE "movement_classifications" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "movement_classifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"native_transfer_id" bigint,
	"token_transfer_id" bigint,
	"movement_type" "movement_type" NOT NULL,
	"classification" "info_classification" NOT NULL,
	"basis" text NOT NULL,
	"label_id" bigint,
	"confidence" numeric(4, 3),
	"classified_at" timestamp with time zone NOT NULL,
	CONSTRAINT "movement_classifications_native_unique" UNIQUE("native_transfer_id"),
	CONSTRAINT "movement_classifications_token_unique" UNIQUE("token_transfer_id"),
	CONSTRAINT "movement_classifications_one_transfer" CHECK (("movement_classifications"."native_transfer_id" is null) <> ("movement_classifications"."token_transfer_id" is null)),
	CONSTRAINT "movement_classifications_allowed_classification" CHECK ("movement_classifications"."classification" in ('verified_fact', 'external_label', 'heuristic', 'assumption')),
	CONSTRAINT "movement_classifications_fact_types" CHECK (("movement_classifications"."movement_type" in ('transfer', 'mint', 'burn')) = ("movement_classifications"."classification" = 'verified_fact')),
	CONSTRAINT "movement_classifications_heuristic_has_confidence" CHECK ("movement_classifications"."classification" <> 'heuristic' or "movement_classifications"."confidence" is not null),
	CONSTRAINT "movement_classifications_confidence_range" CHECK ("movement_classifications"."confidence" is null or ("movement_classifications"."confidence" >= 0 and "movement_classifications"."confidence" <= 1))
);
--> statement-breakpoint
ALTER TABLE "movement_classifications" ADD CONSTRAINT "movement_classifications_native_transfer_id_native_transfers_id_fk" FOREIGN KEY ("native_transfer_id") REFERENCES "public"."native_transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_classifications" ADD CONSTRAINT "movement_classifications_token_transfer_id_token_transfers_id_fk" FOREIGN KEY ("token_transfer_id") REFERENCES "public"."token_transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_classifications" ADD CONSTRAINT "movement_classifications_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE set null ON UPDATE no action;