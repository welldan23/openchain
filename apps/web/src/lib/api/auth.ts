/**
 * Masuk dan daftar akun.
 *
 * Selama fase frontend, fungsi di sini hanya simulasi: tidak ada sesi,
 * cookie, atau penyimpanan, dan kata sandi tidak disimpan ke mana pun. Saat
 * backend siap, ganti isinya dengan pemanggilan API (asumsi kontrak:
 * `POST /auth/sign-in` dan `POST /auth/sign-up` → `AuthResult`, `401` untuk
 * kredensial salah, `409` untuk email terdaftar) tanpa mengubah komponen.
 */
import { normalizeEmail, type SignInInput, type SignUpInput } from "../auth";
import { MOCK_DEMO_ACCOUNT, MOCK_FAILING_AUTH_EMAIL } from "../mock/auth";

const MOCK_LATENCY_MS = 500;

export interface AuthResult {
  displayName: string;
  email: string;
}

/** Galat yang aman ditampilkan ke pengguna. */
export class AuthError extends Error {
  constructor(
    readonly code: "invalid_credentials" | "email_taken",
    message: string,
  ) {
    super(message);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unreachable(email: string): void {
  if (email === MOCK_FAILING_AUTH_EMAIL) throw new Error("Simulasi: layanan akun tidak bisa dihubungi.");
}

export async function signIn(input: SignInInput): Promise<AuthResult> {
  await delay(MOCK_LATENCY_MS);
  const email = normalizeEmail(input.email);
  unreachable(email);
  // Pesan sama untuk email tak dikenal dan kata sandi salah, supaya email terdaftar tidak bisa ditebak.
  if (email !== MOCK_DEMO_ACCOUNT.email || input.password !== MOCK_DEMO_ACCOUNT.password) {
    throw new AuthError("invalid_credentials", "Email atau kata sandi salah.");
  }
  return { displayName: MOCK_DEMO_ACCOUNT.displayName, email };
}

export async function signUp(input: SignUpInput): Promise<AuthResult> {
  await delay(MOCK_LATENCY_MS);
  const email = normalizeEmail(input.email);
  unreachable(email);
  if (email === MOCK_DEMO_ACCOUNT.email) throw new AuthError("email_taken", "Email ini sudah terdaftar. Masuk dengan email tersebut.");
  return { displayName: input.name.trim(), email };
}
