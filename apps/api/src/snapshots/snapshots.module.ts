import { Module } from '@nestjs/common';
import { SnapshotRecorder } from './snapshot-recorder.service.js';

/**
 * Sisi tulis data snapshot. Tidak punya controller: API publik tetap
 * read-only, dan penulisan hanya dilakukan oleh adapter atau job internal.
 */
@Module({
  providers: [SnapshotRecorder],
  exports: [SnapshotRecorder],
})
export class SnapshotsModule {}
