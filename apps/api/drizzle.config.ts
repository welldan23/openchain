import { defineConfig } from 'drizzle-kit';

/**
 * Konfigurasi drizzle-kit untuk membuat file migrasi dari skema.
 * `generate` tidak butuh koneksi database; URL hanya dipakai perintah lain
 * seperti `studio`. Migrasi dijalankan lewat `npm run db:migrate`.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
