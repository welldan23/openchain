/** Query profil, preferensi, dan saklar sumber data pengguna. Isi foto hanya dibaca saat gambarnya diminta. */
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { chains, dataSources, userDataSourceSettings, userPreferences, userProfiles, users } from '../database/schema/index.js';
import type { SourceRunStats } from './data-source-view.js';

@Injectable()
export class AccountRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async profile(userId: number) {
    const [row] = await this.db
      .select({
        id: users.id,
        email: users.email,
        createdAt: users.createdAt,
        displayName: userProfiles.displayName,
        timezone: userProfiles.timezone,
        avatarContentType: userProfiles.avatarContentType,
        avatarSize: userProfiles.avatarSize,
        avatarSha256: userProfiles.avatarSha256,
        avatarUpdatedAt: userProfiles.avatarUpdatedAt,
      })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);
    return row ?? null;
  }

  async avatar(userId: number) {
    const [row] = await this.db
      .select({ data: userProfiles.avatarData, contentType: userProfiles.avatarContentType, sha256: userProfiles.avatarSha256 })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    return row?.data && row.contentType && row.sha256 ? { data: Buffer.from(row.data), contentType: row.contentType, sha256: row.sha256 } : null;
  }

  async updateProfile(userId: number, values: Partial<typeof userProfiles.$inferInsert>): Promise<void> {
    await this.db.update(userProfiles).set(values).where(eq(userProfiles.userId, userId));
  }

  async preferences(userId: number) {
    const [row] = await this.db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
    return row ?? null;
  }

  /** Simpan perubahan; baris dibuat dengan nilai bawaan bila belum ada. */
  async savePreferences(userId: number, values: Partial<Omit<typeof userPreferences.$inferInsert, 'userId'>> & { updatedAt: Date }): Promise<void> {
    await this.db
      .insert(userPreferences)
      .values({ ...values, userId })
      .onConflictDoUpdate({ target: userPreferences.userId, set: values });
  }

  async chains() {
    return this.db.select().from(chains);
  }

  async dataSources() {
    return this.db.select().from(dataSources).orderBy(asc(dataSources.position), asc(dataSources.id));
  }

  async dataSource(id: string) {
    const [row] = await this.db.select().from(dataSources).where(eq(dataSources.id, id)).limit(1);
    return row ?? null;
  }

  /** Ringkasan `provider_runs` sejak `since` per sumber data, dicocokkan lewat `run_provider_pattern`. */
  async sourceRunStats(since: Date): Promise<Map<string, SourceRunStats>> {
    const result = (await this.db.execute(sql`
      select d.id,
        count(r.id)::int as runs,
        count(r.id) filter (where r.status = 'unavailable')::int as failures,
        (array_agg(r.status::text order by r.started_at desc, r.id desc))[1] as last_status,
        max(r.started_at) as last_run,
        max(coalesce(r.fetched_at, r.started_at)) filter (where r.status <> 'unavailable') as last_success,
        max(r.started_at) filter (where r.status = 'unavailable') as last_failure,
        (array_agg(r.error_reason order by r.started_at desc, r.id desc) filter (where r.status = 'unavailable'))[1] as last_failure_reason
      from data_sources d
      join provider_runs r on r.provider like d.run_provider_pattern and r.started_at >= ${since}
      group by d.id`)) as unknown as { rows: Array<Record<string, unknown>> };
    const date = (value: unknown) => (value === null || value === undefined ? null : new Date(value as string | Date));
    return new Map(
      result.rows.map((row) => [
        String(row.id),
        {
          runs: Number(row.runs),
          failures: Number(row.failures),
          lastStatusFailed: row.last_status === 'unavailable',
          lastRunAt: date(row.last_run),
          lastSuccessAt: date(row.last_success),
          lastFailureAt: date(row.last_failure),
          lastFailureReason: row.last_failure_reason === null || row.last_failure_reason === undefined ? null : String(row.last_failure_reason),
        },
      ]),
    );
  }

  /** Saklar yang pernah diubah pengguna, per id sumber. */
  async sourceSettings(userId: number): Promise<Map<string, boolean>> {
    const rows = await this.db.select().from(userDataSourceSettings).where(eq(userDataSourceSettings.userId, userId));
    return new Map(rows.map((row) => [row.sourceId, row.enabled]));
  }

  async sourceSetting(userId: number, sourceId: string): Promise<boolean | undefined> {
    const [row] = await this.db
      .select({ enabled: userDataSourceSettings.enabled })
      .from(userDataSourceSettings)
      .where(and(eq(userDataSourceSettings.userId, userId), eq(userDataSourceSettings.sourceId, sourceId)))
      .limit(1);
    return row?.enabled;
  }

  async saveSourceSetting(userId: number, sourceId: string, enabled: boolean, now: Date): Promise<void> {
    await this.db
      .insert(userDataSourceSettings)
      .values({ userId, sourceId, enabled, updatedAt: now })
      .onConflictDoUpdate({ target: [userDataSourceSettings.userId, userDataSourceSettings.sourceId], set: { enabled, updatedAt: now } });
  }
}
