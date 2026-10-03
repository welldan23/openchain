/**
 * Muat `.env` bila ada. File ini opsional: variabel bisa datang langsung dari
 * environment. Isinya tidak pernah dicetak.
 */
export function loadDotEnv(): void {
  try {
    process.loadEnvFile('.env');
  } catch {
    // .env tidak ada; pakai environment yang sudah ada.
  }
}
