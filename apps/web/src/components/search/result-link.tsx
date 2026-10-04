"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { investigationFromResult, withSearchOrigin } from "@/lib/search";
import type { SearchResult } from "@/lib/types";
import { recordVisit } from "./record-visit";

/**
 * Tautan hasil pencarian: membuka halaman investigasinya dengan membawa kata
 * kunci asal (untuk tombol kembali) dan mencatatnya ke riwayat.
 */
export function ResultLink({ result, query, className, children }: { result: SearchResult; query: string; className?: string; children: ReactNode }) {
  return (
    <Link href={withSearchOrigin(result.href, query)} onClick={() => recordVisit(investigationFromResult(result))} className={className}>
      {children}
    </Link>
  );
}
