-- Data referensi chain sesuai prioritas adapter di PRD.
-- Semua chain dimulai dengan support_status 'planned': adapter belum dibuat dan
-- belum lolos smoke test, jadi belum boleh disebut didukung. Chain ID dan URL
-- explorer wajib dicek ulang saat adapter chain tersebut dibuat.
-- Idempotent: menjalankan ulang tidak menggandakan baris dan tidak menurunkan
-- support_status yang sudah dinaikkan.
INSERT INTO "chains" ("id", "family", "evm_chain_id", "name", "native_symbol", "explorer_url", "support_status") VALUES
  ('robinhood', 'evm', 4663, 'Robinhood Chain', 'ETH', NULL, 'planned'),
  ('ethereum', 'evm', 1, 'Ethereum', 'ETH', 'https://etherscan.io', 'planned'),
  ('base', 'evm', 8453, 'Base', 'ETH', 'https://basescan.org', 'planned'),
  ('bsc', 'evm', 56, 'BNB Chain', 'BNB', 'https://bscscan.com', 'planned'),
  ('arbitrum', 'evm', 42161, 'Arbitrum One', 'ETH', 'https://arbiscan.io', 'planned'),
  ('optimism', 'evm', 10, 'OP Mainnet', 'ETH', 'https://optimistic.etherscan.io', 'planned'),
  ('polygon', 'evm', 137, 'Polygon PoS', 'POL', 'https://polygonscan.com', 'planned'),
  ('hyperevm', 'evm', 999, 'HyperEVM', 'HYPE', NULL, 'planned'),
  ('solana', 'solana', NULL, 'Solana', 'SOL', 'https://solscan.io', 'planned'),
  ('bitcoin', 'bitcoin', NULL, 'Bitcoin', 'BTC', NULL, 'planned'),
  ('tron', 'tron', NULL, 'Tron', 'TRX', NULL, 'planned'),
  ('ton', 'ton', NULL, 'TON', 'TON', NULL, 'planned')
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "native_symbol" = EXCLUDED."native_symbol",
  "explorer_url" = COALESCE("chains"."explorer_url", EXCLUDED."explorer_url");
