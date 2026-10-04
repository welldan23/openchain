CREATE TYPE "public"."search_entity_kind" AS ENUM('token', 'address');--> statement-breakpoint
CREATE TABLE "search_entities" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "search_entities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" "search_entity_kind" NOT NULL,
	"chain_id" text NOT NULL,
	"address_id" bigint NOT NULL,
	"token_id" bigint,
	"title" text NOT NULL,
	"subtitle" text,
	"label_type" "entity_label_type",
	"label_name" text,
	"label_source" "label_source",
	"label_source_name" text,
	"search_text" text NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', "search_entities"."search_text")) STORED NOT NULL,
	"refreshed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "search_entities_kind_address_unique" UNIQUE("kind","chain_id","address_id"),
	CONSTRAINT "search_entities_token_has_token_id" CHECK (("search_entities"."kind" = 'token') = ("search_entities"."token_id" is not null)),
	CONSTRAINT "search_entities_search_text_lowercase" CHECK ("search_entities"."search_text" = lower("search_entities"."search_text") and length("search_entities"."search_text") > 0),
	CONSTRAINT "search_entities_label_has_source" CHECK (("search_entities"."label_type" is null) = ("search_entities"."label_source" is null) and ("search_entities"."label_source" is null) = ("search_entities"."label_source_name" is null))
);
--> statement-breakpoint
ALTER TABLE "search_entities" ADD CONSTRAINT "search_entities_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_entities" ADD CONSTRAINT "search_entities_chain_address_fk" FOREIGN KEY ("chain_id","address_id") REFERENCES "public"."addresses"("chain_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_entities" ADD CONSTRAINT "search_entities_chain_token_fk" FOREIGN KEY ("chain_id","token_id") REFERENCES "public"."tokens"("chain_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_entities_vector_idx" ON "search_entities" USING gin ("search_vector");