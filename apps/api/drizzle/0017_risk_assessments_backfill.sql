-- Salin penilaian risiko token lama (skor dan temuan per snapshot token) ke
-- model penilaian objek (`risk_assessments`). Hanya menyalin; data lama tetap
-- ada. Aman dijalankan ulang (ON CONFLICT DO NOTHING / NOT EXISTS).
--
-- Aturan kejujuran:
-- - Poin per alasan dibiarkan kosong: data lama tidak menyimpan poin per temuan,
--   jadi tidak dikarang. Skor penilaian tetap skor snapshot aslinya.
-- - Temuan berklasifikasi `unavailable` tidak disalin karena bukan klaim.
-- - Snapshot yang tidak lengkap diberi alasan dari provider yang gagal, atau
--   keterangan bahwa alasannya tidak tersimpan.
INSERT INTO "risk_assessments" (
	"chain_id", "address_id", "object_kind", "token_snapshot_id", "methodology",
	"score", "level", "data_status", "status_reason", "block_number", "fetched_at", "assessed_at"
)
SELECT
	t."chain_id", t."address_id", 'token', s."id", 'token-snapshot-legacy',
	s."risk_score", s."risk_level", s."data_status",
	CASE WHEN s."data_status" = 'complete' THEN NULL ELSE coalesce(
		(SELECT string_agg(DISTINCT r."provider" || ': ' || r."error_reason", '; ')
			FROM "token_snapshot_sources" ss JOIN "provider_runs" r ON r."id" = ss."provider_run_id"
			WHERE ss."snapshot_id" = s."id" AND r."error_reason" IS NOT NULL),
		'Disalin dari snapshot token lama; alasan ketidaklengkapannya tidak tersimpan.'
	) END,
	s."block_number", s."fetched_at", s."fetched_at"
FROM "token_snapshots" s
JOIN "tokens" t ON t."id" = s."token_id"
WHERE s."risk_score" IS NOT NULL
	OR EXISTS (SELECT 1 FROM "risk_findings" f WHERE f."snapshot_id" = s."id")
ON CONFLICT ("chain_id", "address_id", "block_number", "methodology") DO NOTHING;
--> statement-breakpoint
INSERT INTO "risk_assessment_sources" ("assessment_id", "provider_run_id")
SELECT a."id", ss."provider_run_id"
FROM "risk_assessments" a
JOIN "token_snapshot_sources" ss ON ss."snapshot_id" = a."token_snapshot_id"
WHERE a."methodology" = 'token-snapshot-legacy'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "risk_reasons" ("assessment_id", "code", "title", "description", "severity", "classification", "points", "position")
SELECT a."id", f."code", f."title", f."description", f."severity", f."classification", NULL,
	(row_number() OVER (PARTITION BY a."id" ORDER BY f."id") - 1)::smallint
FROM "risk_assessments" a
JOIN "risk_findings" f ON f."snapshot_id" = a."token_snapshot_id"
WHERE a."methodology" = 'token-snapshot-legacy' AND f."classification" <> 'unavailable'
ON CONFLICT ("assessment_id", "code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "risk_reason_evidence" ("reason_id", "chain_id", "tx_hash", "evidence_id")
SELECT DISTINCT ON (rr."id", e."chain_id", e."tx_hash") rr."id", e."chain_id", e."tx_hash", e."id"
FROM "risk_assessments" a
JOIN "risk_reasons" rr ON rr."assessment_id" = a."id"
JOIN "risk_findings" f ON f."snapshot_id" = a."token_snapshot_id" AND f."code" = rr."code"
JOIN "risk_finding_evidence" fe ON fe."finding_id" = f."id"
JOIN "evidence" e ON e."id" = fe."evidence_id"
WHERE a."methodology" = 'token-snapshot-legacy' AND e."tx_hash" IS NOT NULL
ORDER BY rr."id", e."chain_id", e."tx_hash", e."id"
ON CONFLICT ("reason_id", "chain_id", "tx_hash") DO NOTHING;
