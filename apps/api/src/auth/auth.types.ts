/** Kontrak `/api/auth`. Token sesi tidak pernah ada di body; hanya di cookie HttpOnly. */
export interface AccountView {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  createdAt: string;
}

export interface AuthResponse {
  user: AccountView;
  session: { expiresAt: string };
}
