/**
 * Validasi form masuk dan daftar, murni. Pesan galat dalam bahasa
 * sederhana dan ditujukan ke kolomnya. Kata sandi tidak pernah dipotong
 * atau diubah; hanya diperiksa.
 */
export const NAME_MIN = 2;
export const NAME_MAX = 60;
export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 8;
/** Batas panjang umum hash kata sandi (bcrypt membaca maksimal 72 byte). */
export const PASSWORD_MAX = 72;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type SignInField = "email" | "password";
export type SignUpField = "name" | "email" | "password" | "confirm";
export type FieldErrors<F extends string> = Partial<Record<F, string>>;

export interface SignInInput {
  email: string;
  password: string;
}

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
  confirm: string;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function emailError(value: string): string | undefined {
  const email = value.trim();
  if (email === "") return "Email wajib diisi.";
  if (email.length > EMAIL_MAX) return `Email maksimal ${EMAIL_MAX} karakter.`;
  if (!EMAIL.test(email)) return "Format email belum benar, contoh: nama@domain.com.";
  return undefined;
}

export function validateSignIn(input: SignInInput): FieldErrors<SignInField> {
  const errors: FieldErrors<SignInField> = {};
  const email = emailError(input.email);
  if (email) errors.email = email;
  if (input.password === "") errors.password = "Kata sandi wajib diisi.";
  return errors;
}

/** Kekuatan dasar kata sandi baru: panjang, huruf, dan angka. */
export function passwordChecks(password: string): Array<{ id: "length" | "letter" | "digit"; label: string; ok: boolean }> {
  return [
    { id: "length", label: `${PASSWORD_MIN}–${PASSWORD_MAX} karakter`, ok: password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX },
    { id: "letter", label: "Ada huruf", ok: /\p{L}/u.test(password) },
    { id: "digit", label: "Ada angka", ok: /\d/.test(password) },
  ];
}

export function validateSignUp(input: SignUpInput): FieldErrors<SignUpField> {
  const errors: FieldErrors<SignUpField> = {};
  const name = input.name.trim();
  if (name === "") errors.name = "Nama wajib diisi.";
  else if (name.length < NAME_MIN || name.length > NAME_MAX) errors.name = `Nama ${NAME_MIN}–${NAME_MAX} karakter.`;
  const email = emailError(input.email);
  if (email) errors.email = email;
  if (input.password === "") errors.password = "Kata sandi wajib diisi.";
  else if (input.password.length > PASSWORD_MAX) errors.password = `Kata sandi maksimal ${PASSWORD_MAX} karakter.`;
  else if (passwordChecks(input.password).some((check) => !check.ok)) errors.password = `Kata sandi minimal ${PASSWORD_MIN} karakter dan berisi huruf serta angka.`;
  else if (normalizeEmail(input.password) === normalizeEmail(input.email)) errors.password = "Kata sandi tidak boleh sama dengan email.";
  if (input.confirm === "") errors.confirm = "Ulangi kata sandi.";
  else if (input.confirm !== input.password) errors.confirm = "Kata sandi tidak sama.";
  return errors;
}

/** Kolom galat pertama sesuai urutan form, untuk difokuskan. */
export function firstErrorField<F extends string>(errors: FieldErrors<F>, order: readonly F[]): F | null {
  return order.find((field) => errors[field] !== undefined) ?? null;
}
