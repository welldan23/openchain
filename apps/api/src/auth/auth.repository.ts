/** Query akun dan sesi. */
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { users, userSessions } from '../database/schema/index.js';

export type UserRow = typeof users.$inferSelect;

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

  async findByEmail(emailNormalized: string): Promise<UserRow | null> {
    const [row] = await this.db.select().from(users).where(eq(users.emailNormalized, emailNormalized)).limit(1);
    return row ?? null;
  }

  async insertUser(values: typeof users.$inferInsert): Promise<UserRow> {
    const [row] = await this.db.insert(users).values(values).returning();
    return row;
  }

  async updateUser(id: number, values: Partial<typeof users.$inferInsert>): Promise<void> {
    await this.db.update(users).set(values).where(eq(users.id, id));
  }

  async insertSession(values: typeof userSessions.$inferInsert): Promise<void> {
    await this.db.insert(userSessions).values(values);
  }

  /** Sesi aktif (belum dicabut, belum kedaluwarsa) beserta penggunanya. */
  async activeSession(tokenHash: string, now: Date) {
    const [row] = await this.db
      .select({ session: userSessions, user: users })
      .from(userSessions)
      .innerJoin(users, eq(users.id, userSessions.userId))
      .where(and(eq(userSessions.tokenHash, tokenHash), isNull(userSessions.revokedAt), gt(userSessions.expiresAt, now)))
      .limit(1);
    return row ?? null;
  }

  async touchSession(id: number, at: Date): Promise<void> {
    await this.db.update(userSessions).set({ lastSeenAt: at }).where(eq(userSessions.id, id));
  }
}
