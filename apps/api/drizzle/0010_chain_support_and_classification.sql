CREATE TYPE "public"."chain_capability" AS ENUM('token_snapshot', 'holders', 'contract_info', 'market_data', 'contract_security', 'fund_flow', 'internal_traces', 'multichain_profile');--> statement-breakpoint
CREATE TABLE "chain_capabilities" (
	"chain_id" text NOT NULL,
	"capability" "chain_capability" NOT NULL,
	"status" "chain_support_status" NOT NULL,
	"source" text,
	"reason" text,
	"check_id" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chain_capabilities_pk" PRIMARY KEY("chain_id","capability"),
	CONSTRAINT "chain_capabilities_needs_check" CHECK ("chain_capabilities"."status" = 'planned' or ("chain_capabilities"."check_id" is not null and "chain_capabilities"."source" is not null))
);
--> statement-breakpoint
CREATE TABLE "chain_smoke_checks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "chain_smoke_checks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"chain_id" text NOT NULL,
	"status" "chain_support_status" NOT NULL,
	"checks" jsonb NOT NULL,
	"tested_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chain_smoke_checks_checks_is_array" CHECK (jsonb_typeof("chain_smoke_checks"."checks") = 'array')
);
--> statement-breakpoint
CREATE TABLE "info_classification_labels" (
	"classification" "info_classification" PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "info_classification_labels_position_unique" UNIQUE("position")
);
--> statement-breakpoint
ALTER TABLE "chains" ADD COLUMN "support_check_id" bigint;--> statement-breakpoint
ALTER TABLE "chain_capabilities" ADD CONSTRAINT "chain_capabilities_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chain_capabilities" ADD CONSTRAINT "chain_capabilities_check_id_chain_smoke_checks_id_fk" FOREIGN KEY ("check_id") REFERENCES "public"."chain_smoke_checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chain_smoke_checks" ADD CONSTRAINT "chain_smoke_checks_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chain_smoke_checks_chain_tested_idx" ON "chain_smoke_checks" USING btree ("chain_id","tested_at");--> statement-breakpoint
ALTER TABLE "chains" ADD CONSTRAINT "chains_support_check_id_chain_smoke_checks_id_fk" FOREIGN KEY ("support_check_id") REFERENCES "public"."chain_smoke_checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Status dukungan lama dicatat tanpa hasil smoke test tersimpan, jadi belum
-- punya bukti. Turunkan ke 'planned' supaya constraint di bawah berlaku; jalankan
-- ulang `npm run smoke:chain -- all --record` untuk menaikkannya dengan bukti.
UPDATE "chains" SET "support_status" = 'planned' WHERE "support_check_id" IS NULL AND "support_status" <> 'planned';--> statement-breakpoint
ALTER TABLE "chains" ADD CONSTRAINT "chains_support_needs_check" CHECK ("chains"."support_status" = 'planned' or "chains"."support_check_id" is not null);--> statement-breakpoint
-- Nama dan penjelasan jenis informasi yang dipakai semua halaman. Idempotent.
INSERT INTO "info_classification_labels" ("classification", "name", "description", "position") VALUES
  ('verified_fact', 'Fakta on-chain', 'Terbaca langsung dari blockchain dan bisa dicek ulang lewat hash transaksi atau nomor blok.', 1),
  ('derived_metric', 'Kalkulasi', 'Dihitung dari fakta on-chain, mis. persentase supply atau total transfer. Benar selama datanya lengkap.', 2),
  ('external_label', 'Label eksternal', 'Berasal dari sumber luar seperti explorer. Bisa keliru dan bukan bukti kepemilikan.', 3),
  ('heuristic', 'Dugaan (heuristic)', 'Kesimpulan dari pola data dengan tingkat keyakinan. Bisa salah dan selalu disertai alasannya.', 4),
  ('assumption', 'Asumsi', 'Anggapan atau catatan pengguna yang belum diverifikasi.', 5),
  ('unavailable', 'Tidak tersedia', 'Datanya tidak bisa diambil; tidak sama dengan nol atau tidak ada.', 6)
ON CONFLICT ("classification") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "position" = EXCLUDED."position";
