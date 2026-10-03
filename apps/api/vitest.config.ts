import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Path alias dari tsconfig.json, mis. yang ditambahkan `nest g library`.
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    env: {
      // Pool pg tidak membuka koneksi sampai ada query, jadi nilai ini cukup
      // supaya modul database bisa dibuat di tes tanpa server PostgreSQL.
      DATABASE_URL: 'postgres://test:test@127.0.0.1:1/test',
    },
  },
});
