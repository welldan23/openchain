/**
 * Masuk dan daftar akun.
 *
 * Mode live memanggil `POST /auth/sign-in` dan `POST /auth/sign-up`; backend
 * memasang cookie sesi HttpOnly, jadi token tidak pernah terlihat di sini.
 * Mode tiruan hanya simulasi: tidak ada sesi, cookie, atau penyimpanan, dan
 * kata sandi tidak disimpan ke mana pun.
 */
import { normalizeEmail, type SignInInput, type SignUpInput } from "../auth";
import { MOCK_DEMO_ACCOUNT, MOCK_FAILING_AUTH_EMAIL } from "../mock/auth";
import { ApiError, apiJson, isLive } from "./http";

const MOCK_LATENCY_MS = 500;

export interface AuthResult {
  displayName: string;
  email: string;
}

/** Galat yang aman ditampilkan ke pengguna. */
export class AuthError extends Error {
  constructor(
    readonly code: "invalid_credentials" | "email_taken" | "locked",
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

interface LiveAuthResponse {
  user: { displayName: string; email: string };
}

/** Galat kredensial dari API diteruskan dengan pesannya; galat lain dibiarkan. */
function authError(error: unknown): unknown {
  if (!(error instanceof ApiError)) return error;
  if (error.status === 401) return new AuthError("invalid_credentials", error.message);
  if (error.status === 409) return new AuthError("email_taken", error.message);
  if (error.status === 429) return new AuthError("locked", error.message);
  return error;
}

async function liveAuth(path: string, body: Record<string, string>): Promise<AuthResult> {
  try {
    const { user } = await apiJson<LiveAuthResponse>(path, { method: "POST", body });
    return { displayName: user.displayName, email: user.email };
  } catch (error) {
    throw authError(error);
  }
}

export async function signIn(input: SignInInput): Promise<AuthResult> {
  if (isLive()) return liveAuth("/auth/sign-in", { email: input.email, password: input.password });
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
  if (isLive()) return liveAuth("/auth/sign-up", { name: input.name, email: input.email, password: input.password });
  await delay(MOCK_LATENCY_MS);
  const email = normalizeEmail(input.email);
  unreachable(email);
  if (email === MOCK_DEMO_ACCOUNT.email) throw new AuthError("email_taken", "Email ini sudah terdaftar. Masuk dengan email tersebut.");
  return { displayName: input.name.trim(), email };
}
