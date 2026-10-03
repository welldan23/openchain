import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

/**
 * Tipe database yang dipakai service. Sengaja memakai tipe dasar PgDatabase
 * supaya tes bisa memakai PGlite tanpa server PostgreSQL.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Token injeksi untuk instance Drizzle. */
export const DATABASE = Symbol('DATABASE');
const PG_POOL = Symbol('PG_POOL');

/**
 * Koneksi PostgreSQL untuk seluruh aplikasi. URL koneksi dibaca dari
 * environment variable `DATABASE_URL` dan tidak pernah dicetak ke log.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Pool({ connectionString: config.getOrThrow<string>('DATABASE_URL') }),
    },
    {
      provide: DATABASE,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
