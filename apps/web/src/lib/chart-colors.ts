/**
 * Warna grafik, diambil dari palet referensi dataviz dan divalidasi di atas
 * permukaan panel (bg-surface #0d1420) dengan validator palet:
 * - SERIES_1: kategorikal slot 1 versi gelap, kontras 5,07:1 terhadap panel.
 * - ORDINAL_BLUE: ramp ordinal satu hue (lolos cek --ordinal mode gelap);
 *   urutan dari yang paling menonjol ke yang paling redup.
 * Teks tidak pernah memakai warna ini; warna hanya untuk mark (batang, swatch).
 */
export const CHART_SURFACE = "#0d1420";

export const SERIES_1 = "#3987e5";

export const ORDINAL_BLUE = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab"] as const;
