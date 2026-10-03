-- Explorer resmi Robinhood Chain adalah Blockscout
-- (https://robinhoodchain.blockscout.com), sesuai dokumentasi Blockscout dan
-- registry chain Blockscout untuk chain ID 4663. URL ini dipakai untuk tautan
-- bukti transaksi. Hanya mengisi yang masih kosong, jadi aman dijalankan ulang
-- dan tidak menimpa URL yang sudah diatur manual.
UPDATE "chains"
SET "explorer_url" = 'https://robinhoodchain.blockscout.com'
WHERE "id" = 'robinhood' AND "explorer_url" IS NULL;
