/**
 * Jalankan migrasi database: `npm run db:migrate` (dev) atau
 * `node dist/database/migrate.js` (setelah build).
 *
 * Aman dijalankan berulang: migrasi yang sudah diterapkan dilewati.
 * URL koneksi tidak pernah dicetak.
 */
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { loadDotEnv } from '../common/env.js';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

async function main(): Promise<void> {
  loadDotEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL belum diisi. Salin .env.example menjadi .env lalu sesuaikan.');
    process.exitCode = 1;
    return;
  }

  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
    console.log('Migrasi database selesai.');
  } catch (error) {
    // Pesan error pg tidak memuat password, tapi URL tetap tidak dicetak.
    console.error('Migrasi database gagal:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await main();
