/** Query profil pengguna. Isi foto hanya dibaca saat gambarnya diminta. */
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { userProfiles, users } from '../database/schema/index.js';

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
}
