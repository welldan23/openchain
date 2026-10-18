import { BadRequestException, Body, Controller, Delete, Get, Headers, Patch, Put, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentAccount, SessionGuard, type SignedInRequest } from '../auth/session.guard.js';
import { AVATAR_MAX_BYTES } from '../database/schema/accounts.js';
import { AccountService } from './account.service.js';
import type { PreferencesView, ProfileView } from './account.types.js';
import { parsePreferencesUpdate } from './preferences-input.js';
import { parseProfileUpdate, ProfileInputError, validateAvatar } from './profile-input.js';

type Account = NonNullable<SignedInRequest['account']>;

function parsed<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof ProfileInputError) throw new BadRequestException(error.message);
    throw error;
  }
}

/**
 * Profil pengguna yang sedang masuk. `GET`/`PATCH /account/profile`,
 * `PUT /account/avatar` (multipart, kolom `avatar`, maks. 2 MB),
 * `DELETE /account/avatar`, `GET /account/avatar` untuk gambarnya, serta
 * `GET`/`PATCH /account/preferences` untuk preferensi tampilan.
 */
@Controller('account')
@UseGuards(SessionGuard)
export class AccountController {
  constructor(private readonly service: AccountService) {}

  @Get('profile')
  profile(@CurrentAccount() account: Account, @Res({ passthrough: true }) res: Response): Promise<ProfileView> {
    res.setHeader('Cache-Control', 'no-store');
    return this.service.profile(account.userId);
  }

  @Patch('profile')
  update(@CurrentAccount() account: Account, @Body() body: unknown): Promise<ProfileView> {
    return this.service.update(account.userId, parsed(() => parseProfileUpdate(body)));
  }

  @Put('avatar')
  // Berkas ditampung di memori (maks. 2 MB, satu berkas, tanpa kolom lain) lalu disimpan ke database.
  @UseInterceptors(FileInterceptor('avatar', { limits: { fileSize: AVATAR_MAX_BYTES, files: 1, fields: 0, parts: 1 } }))
  setAvatar(@CurrentAccount() account: Account, @UploadedFile() file: { buffer: Buffer } | undefined): Promise<ProfileView> {
    const { data, contentType } = parsed(() => validateAvatar(file?.buffer));
    return this.service.setAvatar(account.userId, data, contentType);
  }

  @Delete('avatar')
  removeAvatar(@CurrentAccount() account: Account): Promise<ProfileView> {
    return this.service.removeAvatar(account.userId);
  }

  @Get('avatar')
  async avatar(@CurrentAccount() account: Account, @Headers('if-none-match') ifNoneMatch: string | undefined, @Res({ passthrough: true }) res: Response): Promise<StreamableFile | undefined> {
    const avatar = await this.service.avatar(account.userId);
    const etag = `"${avatar.sha256}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (ifNoneMatch === etag) {
      res.status(304);
      return undefined;
    }
    return new StreamableFile(avatar.data, { type: avatar.contentType, disposition: 'inline', length: avatar.data.length });
  }

  @Get('preferences')
  preferences(@CurrentAccount() account: Account, @Res({ passthrough: true }) res: Response): Promise<PreferencesView> {
    res.setHeader('Cache-Control', 'no-store');
    return this.service.preferences(account.userId);
  }

  @Patch('preferences')
  updatePreferences(@CurrentAccount() account: Account, @Body() body: unknown): Promise<PreferencesView> {
    return this.service.updatePreferences(account.userId, parsed(() => parsePreferencesUpdate(body)));
  }
}
