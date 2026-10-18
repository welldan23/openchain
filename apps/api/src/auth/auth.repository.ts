/** Query akun dan sesi. */
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { userProfiles, users, userSessions } from '../database/schema/index.js';

export type UserRow = typeof users.$inferSelect;
export type ProfileRow = typeof userProfiles.$inferSelect;
/** Akun beserta profilnya (tanpa isi foto, yang hanya dibaca saat diminta). */
export type AccountRow = { user: UserRow; profile: Omit<ProfileRow, 'avatarData'> };

const PROFILE_COLUMNS = {
  userId: userProfiles.userId,
  displayName: userProfiles.displayName,
  timezone: userProfiles.timezone,
  avatarContentType: userProfiles.avatarContentType,
  avatarSize: userProfiles.avatarSize,
  avatarSha256: userProfiles.avatarSha256,
  avatarUpdatedAt: userProfiles.avatarUpdatedAt,
  updatedAt: userProfiles.updatedAt,
};

/** Error PostgreSQL pelanggaran unik untuk constraint tertentu (bisa terbungkus error Drizzle). */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    const pg = current as Error & { code?: string; constraint?: string };
    if (pg.code === '23505' && (pg.constraint === constraint || pg.message.includes(constraint))) return true;
  }
  return false;
}

@Injectable()
export class AuthRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findByEmail(emailNormalized: string): Promise<AccountRow | null> {
    const [row] = await this.db
      .select({ user: users, profile: PROFILE_COLUMNS })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.emailNormalized, emailNormalized))
      .limit(1);
    return row ?? null;
  }

  /** Akun dan profilnya dibuat bersama dalam satu transaksi. */
  async insertAccount(user: typeof users.$inferInsert, profile: Omit<typeof userProfiles.$inferInsert, 'userId'>): Promise<AccountRow> {
    return this.db.transaction(async (tx) => {
      const [userRow] = await tx.insert(users).values(user).returning();
      const [profileRow] = await tx
        .insert(userProfiles)
        .values({ ...profile, userId: userRow.id })
        .returning(PROFILE_COLUMNS);
      return { user: userRow, profile: profileRow };
    });
  }

  async updateUser(id: number, values: Partial<typeof users.$inferInsert>): Promise<void> {
    await this.db.update(users).set(values).where(eq(users.id, id));
  }

  async insertSession(values: typeof userSessions.$inferInsert): Promise<void> {
    await this.db.insert(userSessions).values(values);
  }

  /** Sesi aktif (belum dicabut, belum kedaluwarsa) beserta akun dan profilnya. */
  async activeSession(tokenHash: string, now: Date) {
    const [row] = await this.db
      .select({ session: userSessions, user: users, profile: PROFILE_COLUMNS })
      .from(userSessions)
      .innerJoin(users, eq(users.id, userSessions.userId))
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(userSessions.tokenHash, tokenHash), isNull(userSessions.revokedAt), gt(userSessions.expiresAt, now)))
      .limit(1);
    return row ?? null;
  }

  /** Cabut satu sesi berdasarkan hash tokennya; yang sudah dicabut tidak berubah. */
  async revokeSession(tokenHash: string, at: Date): Promise<boolean> {
    const rows = await this.db
      .update(userSessions)
      .set({ revokedAt: at })
      .where(and(eq(userSessions.tokenHash, tokenHash), isNull(userSessions.revokedAt)))
      .returning({ id: userSessions.id });
    return rows.length > 0;
  }

  /** Cabut semua sesi aktif seorang pengguna; menjawab jumlah yang dicabut. */
  async revokeAllSessions(userId: number, at: Date): Promise<number> {
    const rows = await this.db
      .update(userSessions)
      .set({ revokedAt: at })
      .where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)))
      .returning({ id: userSessions.id });
    return rows.length;
  }

  async touchSession(id: number, at: Date): Promise<void> {
    await this.db.update(userSessions).set({ lastSeenAt: at }).where(eq(userSessions.id, id));
  }
}
