"use client";

import { usePathname } from "next/navigation";
import { GlobalSearch } from "./global-search";

/**
 * Kolom cari di header. Disembunyikan di /cari karena halaman itu sudah punya
 * kolom besar, dan dipasang ulang tiap pindah halaman supaya isiannya bersih.
 */
export function HeaderSearch() {
  const pathname = usePathname();
  if (pathname === "/cari") return null;
  return <GlobalSearch key={pathname} variant="header" />;
}
