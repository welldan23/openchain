/**
 * Nilai risiko satu address dari data tersimpan (metode openchain-risk-v1):
 *
 *   npm run risk:assess -- <address> [chain] [--json]
 *
 * Tanpa chain, address dinilai di semua chain satu keluarga tempat ia
 * tercatat. Tidak menghubungi provider; hasil disimpan ke risk_assessments.
 * URL database tidak pernah dicetak. Kode keluar 0 bila minimal satu chain
 * berhasil dinilai.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { systemClock } from '../common/clock.js';
import { loadDotEnv } from '../common/env.js';
import type { Database } from '../database/database.module.js';
import * as schema from '../database/schema/index.js';
import { RiskScoringError, RiskScoringService } from '../risk/risk-scoring.service.js';
import { RiskRepository } from '../risk/risk.repository.js';
import { formatInteger, parseArgs } from './cli-format.js';

const USAGE = 'Pemakaian: npm run risk:assess -- <address> [chain] [--json]';

async function main() {
  loadDotEnv();
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [address, chainId] = positional;
  if (!address) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL belum diisi. Salin .env.example menjadi .env.');
    process.exitCode = 1;
    return;
  }
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool, { schema }) as unknown as Database;
    const service = new RiskScoringService(new RiskRepository(db), systemClock);
    const results = await service.assessAddress(address, chainId);
    if (flags.has('json')) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      for (const result of results) {
        if (result.status === 'no_data') {
          console.log(`○ ${result.chainId} · ${result.objectKind} · tidak dinilai: ${result.reason}`);
          continue;
        }
        const { draft } = result;
        console.log(
          `● ${result.chainId} · ${result.objectKind} · skor ${draft.score ?? '–'} (${draft.level}) · blok ${formatInteger(result.blockNumber)} · data ${result.dataStatus}${result.statusReason ? ` (${result.statusReason})` : ''}`,
        );
        for (const reason of draft.reasons) {
          console.log(`   + ${reason.points ?? '·'} ${reason.title} [${reason.classification}, ${reason.evidence.length} hash]`);
        }
        for (const warning of draft.warnings) console.log(`   ! ${warning.title}`);
        const counts = { detected: 0, clear: 0, unknown: 0 };
        for (const item of draft.traits) counts[item.status] += 1;
        console.log(`   ciri: ${counts.detected} terdeteksi · ${counts.unknown} belum bisa dicek · ${counts.clear} tidak terdeteksi`);
      }
    }
    process.exitCode = results.some((result) => result.status === 'assessed') ? 0 : 1;
  } catch (error) {
    if (error instanceof RiskScoringError) {
      console.error(error.message);
      process.exitCode = 1;
    } else {
      throw error;
    }
  } finally {
    await pool.end();
  }
}

await main();
