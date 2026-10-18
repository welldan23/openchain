/** Kontrak `/api/account`: profil pengguna yang sedang masuk. */
export interface ProfileView {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  joinedAt: string;
  /** Alamat foto profil (berubah tiap foto diganti), atau `null` bila memakai inisial. */
  avatarUrl: string | null;
  avatar: { contentType: string; size: number; updatedAt: string } | null;
}
