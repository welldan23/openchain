/**
 * Penjelasan saat peta tidak punya cukup data untuk ditampilkan. Tujuannya
 * jujur: kosong karena datanya belum ada tidak sama dengan kosong karena
 * memang tidak ada hubungan, dan keduanya bukan tanda token aman.
 */

export type MapEmptyReason = 'no_snapshot' | 'no_holders' | 'filtered_out' | 'no_history' | 'no_connections';

/** Langkah lanjut yang bisa dijadikan tombol oleh frontend. */
export type MapEmptyAction = 'ingest_token' | 'collect_holder_history' | 'reset_filter' | 'widen_radius';

export interface MapEmptyState {
  reason: MapEmptyReason;
  /** `nodes` = tidak ada wallet yang tampil; `edges` = wallet tampil tanpa garis. */
  scope: 'nodes' | 'edges';
  title: string;
  message: string;
  nextSteps: string[];
  actions: MapEmptyAction[];
}

export interface EmptyStateInput {
  symbol: string | null;
  hasSnapshot: boolean;
  /** Wallet di peta tersimpan, sebelum radius dan filter. */
  storedNodes: number;
  /** Garis di peta tersimpan, sebelum radius dan filter. */
  storedEdges: number;
  /** Wallet dan garis yang tampil setelah radius dan filter. */
  shownNodes: number;
  shownEdges: number;
  /** Peta mencatat riwayat holder belum lengkap. */
  historyIncomplete: boolean;
  filterActive: boolean;
  radius: number;
}

const NOT_SAFE = 'Ini bukan berarti token aman; datanya belum cukup.';

/** `null` bila peta punya wallet dan garis untuk ditampilkan. */
export function mapEmptyState(input: EmptyStateInput): MapEmptyState | null {
  const token = input.symbol ?? 'token ini';
  if (!input.hasSnapshot) {
    return {
      reason: 'no_snapshot',
      scope: 'nodes',
      title: 'Belum ada wallet untuk dipetakan',
      message: `Holder ${token} belum diambil dari blockchain, jadi belum ada gelembung, kelompok, atau gerak serempak yang bisa ditampilkan. ${NOT_SAFE}`,
      nextSteps: ['Ambil data token dulu supaya daftar holder tersimpan, lalu buka peta ini lagi.'],
      actions: ['ingest_token'],
    };
  }
  if (input.storedNodes === 0) {
    return {
      reason: 'no_holders',
      scope: 'nodes',
      title: 'Snapshot belum punya data holder',
      message: `Snapshot terakhir ${token} tidak memuat daftar holder, biasanya karena sumber data holder gagal dihubungi saat diambil. ${NOT_SAFE}`,
      nextSteps: ['Ambil ulang data token untuk mencoba membaca daftar holder lagi.'],
      actions: ['ingest_token'],
    };
  }
  if (input.shownNodes === 0) {
    return {
      reason: 'filtered_out',
      scope: 'nodes',
      title: 'Semua wallet tersembunyi oleh filter',
      message: 'Tidak ada wallet yang cocok dengan filter label, sumber label, waktu, atau jenis garis yang dipilih.',
      nextSteps: ['Hapus sebagian filter untuk menampilkan wallet lagi.'],
      actions: ['reset_filter'],
    };
  }
  if (input.shownEdges > 0) return null;
  if (input.storedEdges > 0) {
    // Garis ada di peta, tapi terpotong radius atau filter.
    return {
      reason: 'filtered_out',
      scope: 'edges',
      title: 'Garis tersembunyi oleh filter atau radius',
      message: 'Peta ini punya transfer di antara wallet, tapi tidak ada yang lolos filter atau radius yang dipilih.',
      nextSteps: [
        input.filterActive ? 'Hapus sebagian filter waktu atau jenis garis.' : null,
        input.radius === 0 ? 'Naikkan radius supaya pendana dan penghubung ikut tampil.' : null,
      ].filter((step): step is string => step !== null),
      actions: [...(input.filterActive ? (['reset_filter'] as const) : []), ...(input.radius === 0 ? (['widen_radius'] as const) : [])],
    };
  }
  if (input.historyIncomplete) {
    return {
      reason: 'no_history',
      scope: 'edges',
      title: 'Riwayat transfer holder belum dipindai',
      message: `Holder ${token} sudah diketahui, tapi riwayat transfer mereka belum (lengkap) dibaca, jadi belum ada garis pendanaan atau transfer yang bisa digambar. ${NOT_SAFE}`,
      nextSteps: ['Kumpulkan riwayat transfer holder, lalu buka peta ini lagi; peta akan dibentuk ulang otomatis.'],
      actions: ['collect_holder_history'],
    };
  }
  return {
    reason: 'no_connections',
    scope: 'edges',
    title: 'Tidak ada hubungan langsung di antara holder',
    message:
      'Riwayat holder sudah dibaca, tapi tidak ada pendana non-exchange, transfer langsung, atau perantara bersama di antara mereka. Ini bukan bukti bahwa holder tidak saling terkait: hubungan bisa lewat exchange atau chain lain.',
    nextSteps: ['Tambah jumlah holder yang dipetakan, atau telusuri wallet tertentu lewat halaman aliran dana.'],
    actions: [],
  };
}
