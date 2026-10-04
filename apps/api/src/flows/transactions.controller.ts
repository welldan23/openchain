import { Controller, Get, Param } from '@nestjs/common';
import { TransactionEvidenceService } from './transaction-evidence.service.js';
import type { TransactionEvidenceResponse } from './transaction-evidence.types.js';

/** Bukti per transaksi untuk modal bukti. Read-only, dari data tersimpan. */
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly evidenceService: TransactionEvidenceService) {}

  @Get(':chain/:hash')
  getTransaction(@Param('chain') chain: string, @Param('hash') hash: string): Promise<TransactionEvidenceResponse> {
    return this.evidenceService.getEvidence(chain, hash);
  }
}
