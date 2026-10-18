CREATE TABLE "data_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "provider_kind" NOT NULL,
	"description" text NOT NULL,
	"integrated" boolean NOT NULL,
	"run_provider_pattern" text,
	"required" boolean DEFAULT false NOT NULL,
	"locked_reason" text,
	"off_effect" text NOT NULL,
	"attribution" text,
	"env_vars" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "data_sources_id_format" CHECK ("data_sources"."id" ~ '^[a-z0-9-]{1,40}$'),
	CONSTRAINT "data_sources_name_length" CHECK (length(btrim("data_sources"."name")) between 1 and 80),
	CONSTRAINT "data_sources_description_length" CHECK (length(btrim("data_sources"."description")) between 1 and 500),
	CONSTRAINT "data_sources_off_effect_length" CHECK (length(btrim("data_sources"."off_effect")) between 1 and 300),
	CONSTRAINT "data_sources_env_vars_is_array" CHECK (jsonb_typeof("data_sources"."env_vars") = 'array'),
	CONSTRAINT "data_sources_pattern_when_integrated" CHECK ("data_sources"."integrated" = ("data_sources"."run_provider_pattern" is not null)),
	CONSTRAINT "data_sources_required_is_integrated" CHECK (not "data_sources"."required" or "data_sources"."integrated"),
	CONSTRAINT "data_sources_locked_is_explained" CHECK (("data_sources"."required" or not "data_sources"."integrated") = ("data_sources"."locked_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "user_data_source_settings" (
	"user_id" bigint NOT NULL,
	"source_id" text NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_data_source_settings_user_id_source_id_pk" PRIMARY KEY("user_id","source_id")
);
--> statement-breakpoint
ALTER TABLE "user_data_source_settings" ADD CONSTRAINT "user_data_source_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_data_source_settings" ADD CONSTRAINT "user_data_source_settings_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_data_source_settings_source_idx" ON "user_data_source_settings" USING btree ("source_id");--> statement-breakpoint
-- Katalog sumber data: hanya provider yang benar-benar dipanggil API, plus
-- InsightX yang sudah diaudit tapi belum terhubung (lihat README, Audit sumber
-- data). Environment variable hanya dicatat namanya, tidak pernah nilainya.
-- Idempotent: menjalankan ulang memperbarui keterangan tanpa menggandakan baris.
INSERT INTO "data_sources" ("id", "name", "kind", "description", "integrated", "run_provider_pattern", "required", "locked_reason", "off_effect", "attribution", "env_vars", "position") VALUES
  ('rpc', 'RPC chain', 'rpc', 'State on-chain, blok, transaksi, receipt, dan log dari RPC publik tiap chain, digabung lewat fallback.', true, '%-rpc', true,
   'Wajib: blok, transaksi, dan log on-chain berasal dari sini.', 'Analisis on-chain tidak bisa berjalan.', NULL,
   '[{"name": "RPC_URL_<CHAIN>", "purpose": "Ganti RPC publik sebuah chain, mis. dengan RPC berbayar. Beberapa URL dipisah koma untuk fallback.", "required": false}]', 10),
  ('blockscout', 'Blockscout', 'explorer', 'Verifikasi kontrak, pembuat kontrak, jumlah dan daftar holder, riwayat transfer, dan label eksternal.', true, 'blockscout', true,
   'Wajib: riwayat transfer dan holder berasal dari sini.', 'Riwayat transfer, holder, dan kode kontrak tidak bisa diambil.', NULL,
   '[{"name": "BLOCKSCOUT_API_KEY", "purpose": "Pakai Blockscout PRO API untuk chain yang di-host Blockscout. Robinhood Chain butuh ini supaya data holder lengkap.", "required": false}, {"name": "BLOCKSCOUT_URL_<CHAIN>", "purpose": "Ganti instance Blockscout sebuah chain.", "required": false}]', 20),
  ('dexscreener', 'Dexscreener', 'market_data', 'Harga, perubahan 24 jam, market cap, FDV, likuiditas, volume, dan jumlah transaksi pair.', true, 'dexscreener', false,
   NULL, 'Harga, likuiditas, dan nilai USD ditandai tidak tersedia; jumlah token tetap tampil.', NULL, '[]', 30),
  ('goplus', 'GoPlus Security', 'security', 'Pajak, blacklist, mint, pause, honeypot, dan pemegang LP sebuah kontrak.', true, 'goplus', false,
   NULL, 'Hasil cek kontrak dari GoPlus ditandai tidak tersedia, bukan aman.', 'Powered by GoPlus',
   '[{"name": "SECURITY_PROVIDERS", "purpose": "Penyedia analisis keamanan yang dipakai server, dipisah koma (goplus, honeypotis); none mematikan semuanya.", "required": false}]', 40),
  ('honeypotis', 'Honeypot.is', 'security', 'Simulasi beli dan jual untuk melihat pajak sungguhan dan apakah token bisa dijual.', true, 'honeypot.is', false,
   NULL, 'Simulasi jual ditandai tidak tersedia, bukan aman.', NULL,
   '[{"name": "SECURITY_PROVIDERS", "purpose": "Penyedia analisis keamanan yang dipakai server, dipisah koma (goplus, honeypotis); none mematikan semuanya.", "required": false}]', 50),
  ('insightx', 'InsightX (label dan klaster)', 'entity_label', 'Label address dan klaster holder. Kandidat yang sudah diaudit, belum dipasang.', false, NULL, false,
   'Belum terhubung: butuh API key untuk diuji ke respons asli, dan syarat pakainya belum jelas.', 'Label dan klaster dari InsightX tidak muncul.', NULL, '[]', 60)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "kind" = EXCLUDED."kind",
  "description" = EXCLUDED."description",
  "integrated" = EXCLUDED."integrated",
  "run_provider_pattern" = EXCLUDED."run_provider_pattern",
  "required" = EXCLUDED."required",
  "locked_reason" = EXCLUDED."locked_reason",
  "off_effect" = EXCLUDED."off_effect",
  "attribution" = EXCLUDED."attribution",
  "env_vars" = EXCLUDED."env_vars",
  "position" = EXCLUDED."position";
