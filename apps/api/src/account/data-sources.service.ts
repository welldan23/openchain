/** Sumber data untuk halaman pengaturan: daftar beserta kondisinya, dan saklar per akun. */
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EVM_CHAIN_DEFINITIONS } from '../chains/chain-definitions.js';
import { compareChains } from '../chains/chains-catalog.mapper.js';
import { DEFAULT_AVAILABILITY_HOURS } from '../chains/chains-catalog.service.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { AccountRepository } from './account.repository.js';
import type { DataSourcesResponse } from './account.types.js';
import { DATA_SOURCE_CAVEATS, lockReason, toDataSourceView, type DataSourceView, type Env, type ViewContext } from './data-source-view.js';

/** Environment server; hanya dibaca untuk tahu variabel sudah diisi atau belum. */
export const SERVER_ENV = Symbol('SERVER_ENV');

@Injectable()
export class DataSourcesService {
  constructor(
    private readonly repository: AccountRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(SERVER_ENV) private readonly env: Env,
  ) {}

  async list(userId: number): Promise<DataSourcesResponse> {
    const { context, from, to } = await this.context();
    const [sources, stats, settings] = await Promise.all([this.repository.dataSources(), this.repository.sourceRunStats(from), this.repository.sourceSettings(userId)]);
    return {
      window: { from: from.toISOString(), to: to.toISOString(), hours: context.windowHours },
      sources: sources.map((source) => toDataSourceView(source, stats.get(source.id), settings.get(source.id), context)),
      caveats: DATA_SOURCE_CAVEATS,
    };
  }

  async setEnabled(userId: number, sourceId: string, enabled: boolean): Promise<DataSourceView> {
    const source = await this.repository.dataSource(sourceId);
    if (!source) throw new NotFoundException(`Sumber data ${sourceId} tidak dikenal.`);
    const locked = lockReason(source, this.env);
    if (locked) throw new ConflictException(`${source.name} tidak bisa diubah. ${locked}`);
    await this.repository.saveSourceSetting(userId, source.id, enabled, this.clock.now());
    const { context, from } = await this.context();
    const stats = await this.repository.sourceRunStats(from);
    return toDataSourceView(source, stats.get(source.id), await this.repository.sourceSetting(userId, source.id), context);
  }

  private async context(): Promise<{ context: ViewContext; from: Date; to: Date }> {
    const to = this.clock.now();
    const from = new Date(to.getTime() - DEFAULT_AVAILABILITY_HOURS * 60 * 60 * 1000);
    const validatedChains = (await this.repository.chains())
      .sort(compareChains)
      .filter((chain) => chain.supportStatus === 'validated')
      .map((chain) => chain.id);
    return { context: { definitions: EVM_CHAIN_DEFINITIONS, validatedChains, env: this.env, windowHours: DEFAULT_AVAILABILITY_HOURS }, from, to };
  }
}
