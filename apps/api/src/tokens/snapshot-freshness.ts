import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLOCK, type Clock } from '../common/clock.js';

/** Batas umur snapshot sebelum dianggap basi, bila tidak diatur lewat env. */
export const DEFAULT_STALE_AFTER_MINUTES = 60;

/** Jam dan batas umur snapshot untuk menentukan status data `stale`. */
@Injectable()
export class SnapshotFreshness {
  readonly staleAfterMinutes: number;

  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    config: ConfigService,
  ) {
    const configured = Number(config.get('SNAPSHOT_STALE_AFTER_MINUTES'));
    this.staleAfterMinutes =
      Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_STALE_AFTER_MINUTES;
  }

  now(): Date {
    return this.clock.now();
  }
}
