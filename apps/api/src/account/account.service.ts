/**
 * Profil pengguna yang sedang masuk (baca, ubah nama dan zona waktu, ganti
 * atau hapus foto) dan preferensi tampilannya.
 */
import { createHash } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { compareChains } from '../chains/chains-catalog.mapper.js';
import { AccountRepository } from './account.repository.js';
import type { PreferencesView, ProfileView } from './account.types.js';
import { defaultChainError, resolveDefaultChain, type PreferencesUpdate } from './preferences-input.js';
import type { AvatarType, ProfileUpdate } from './profile-input.js';

@Injectable()
export class AccountService {
  constructor(
    private readonly repository: AccountRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async profile(userId: number): Promise<ProfileView> {
    const row = await this.repository.profile(userId);
    if (!row) throw new NotFoundException('Profil tidak ditemukan.');
    return {
      id: String(row.id),
      email: row.email,
      displayName: row.displayName,
      timezone: row.timezone,
      joinedAt: row.createdAt.toISOString(),
      // Versi di alamat berubah tiap foto diganti, jadi cache browser tidak menampilkan foto lama.
      avatarUrl: row.avatarSha256 ? `/api/account/avatar?v=${row.avatarSha256.slice(0, 12)}` : null,
      avatar:
        row.avatarContentType && row.avatarSize !== null && row.avatarUpdatedAt
          ? { contentType: row.avatarContentType, size: row.avatarSize, updatedAt: row.avatarUpdatedAt.toISOString() }
          : null,
    };
  }

  async update(userId: number, update: ProfileUpdate): Promise<ProfileView> {
    await this.repository.updateProfile(userId, { ...update, updatedAt: this.clock.now() });
    return this.profile(userId);
  }

  async setAvatar(userId: number, data: Buffer, contentType: AvatarType): Promise<ProfileView> {
    const now = this.clock.now();
    await this.repository.updateProfile(userId, {
      avatarData: data,
      avatarContentType: contentType,
      avatarSize: data.length,
      avatarSha256: createHash('sha256').update(data).digest('hex'),
      avatarUpdatedAt: now,
      updatedAt: now,
    });
    return this.profile(userId);
  }

  async removeAvatar(userId: number): Promise<ProfileView> {
    await this.repository.updateProfile(userId, {
      avatarData: null,
      avatarContentType: null,
      avatarSize: null,
      avatarSha256: null,
      avatarUpdatedAt: null,
      updatedAt: this.clock.now(),
    });
    return this.profile(userId);
  }

  async avatar(userId: number) {
    const found = await this.repository.avatar(userId);
    if (!found) throw new NotFoundException('Belum ada foto profil.');
    return found;
  }

  async preferences(userId: number): Promise<PreferencesView> {
    let row = await this.repository.preferences(userId);
    if (!row) {
      // Akun tanpa baris preferensi (seharusnya tidak terjadi) mendapat nilai bawaan.
      await this.repository.savePreferences(userId, { updatedAt: this.clock.now() });
      row = await this.repository.preferences(userId);
      if (!row) throw new NotFoundException('Preferensi tidak ditemukan.');
    }
    const chains = (await this.repository.chains()).sort(compareChains);
    const resolved = resolveDefaultChain(row.defaultChainId, chains);
    return {
      theme: row.theme,
      language: row.language,
      numberLocale: row.numberLocale,
      timeDisplay: row.timeDisplay,
      compactNumbers: row.compactNumbers,
      valueUnit: row.valueUnit,
      defaultChain: resolved.defaultChain,
      defaultChainSource: resolved.source,
      defaultChainNote: resolved.note,
      density: row.density,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updatePreferences(userId: number, update: PreferencesUpdate): Promise<PreferencesView> {
    const { defaultChain, ...rest } = update;
    if (typeof defaultChain === 'string') {
      const error = defaultChainError(defaultChain, await this.repository.chains());
      if (error) throw new BadRequestException(error);
    }
    await this.repository.savePreferences(userId, { ...rest, ...(defaultChain !== undefined ? { defaultChainId: defaultChain } : {}), updatedAt: this.clock.now() });
    return this.preferences(userId);
  }
}
