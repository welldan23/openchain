/**
 * Deteksi peringatan dini untuk semua objek yang punya data tersimpan
 * (token bersnapshot dan address yang sudah dipindai):
 *
 *   npm run risk:warnings -- [chain] [--json]
 *
 * Setiap objek dinilai ulang dari data tersimpannya (hasilnya disimpan ke
 * risk_assessments), lalu peringatannya dicetak. Tidak menghubungi provider.
 * URL database tidak pernah dicetak.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { systemClock } from '../common/clock.js';
import { loadDotEnv } from '../common/env.js';
import type { Database } from '../database/database.module.js';
import * as schema from '../database/schema/index.js';
import { RiskScoringError, RiskScoringService } from '../risk/risk-scoring.service.js';
import { RiskWarningService } from '../risk/risk-warning.service.js';
import { RiskRepository } from '../risk/risk.repository.js';
import { parseArgs } from './cli-format.js';

async function main() {
  loadDotEnv();
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [chainId] = positional;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL belum diisi. Salin .env.example menjadi .env.');
    process.exitCode = 1;
    return;
  }
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool, { schema }) as unknown as Database;
    const repository = new RiskRepository(db);
    const service = new RiskScoringService(repository, new RiskWarningService(repository), systemClock);
    const chains = await repository.chains();
    if (chainId && !chains.some((chain) => chain.id === chainId)) {
      console.error(`Chain "${chainId}" tidak dikenal.`);
      process.exitCode = 1;
      return;
    }
    const objects = await repository.assessableObjects(chainId);
    const found: Array<{ chain: string; address: string; objectKind: string; code: string; title: string; severity: string; classification: string; detectedAt: string; evidence: number }> = [];
    let assessed = 0;
    for (const object of objects) {
      const [result] = await service.assessAddress(object.address, object.chainId);
      if (result.status !== 'assessed') continue;
      assessed += 1;
      for (const warning of result.draft.warnings) {
        found.push({
          chain: result.chainId,
          address: result.address,
          objectKind: result.objectKind,
          code: warning.code,
          title: warning.title,
          severity: warning.severity,
          classification: warning.classification,
          detectedAt: warning.detectedAt.toISOString(),
          evidence: warning.evidence.length,
        });
      }
    }
    if (flags.has('json')) {
      console.log(JSON.stringify({ assessed, warnings: found }, null, 2));
    } else {
      console.log(`${assessed} objek dinilai dari data tersimpan, ${found.length} peringatan dini.`);
      for (const item of found) {
        console.log(`! ${item.chain} · ${item.objectKind} ${item.address} · ${item.title} [${item.severity}, ${item.classification}, ${item.evidence} hash] · ${item.detectedAt}`);
      }
    }
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
