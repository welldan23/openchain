import { parseSignIn, parseSignUp } from './auth-input.js';
import { hashSessionToken, newSessionToken, readSessionToken, SESSION_COOKIE } from './session-token.js';

describe('validasi akun', () => {
  const valid = { name: ' Rina Analis ', email: ' Rina@Contoh.id ', password: 'rahasia123' };

  it('daftar: nama dan email dirapikan, kata sandi tidak diubah', () => {
    expect(parseSignUp(valid)).toEqual({ name: 'Rina Analis', email: 'Rina@Contoh.id', password: 'rahasia123' });
    expect(parseSignUp({ ...valid, password: ' spasi 123 ' }).password).toBe(' spasi 123 ');
  });

  it('daftar: aturan sama dengan form frontend', () => {
    const bad: Array<[Record<string, unknown>, string]> = [
      [{ ...valid, name: 'R' }, 'Nama 2–60'],
      [{ ...valid, email: 'rina@contoh' }, 'Format email'],
      [{ ...valid, password: 'pendek1' }, 'minimal 8'],
      [{ ...valid, password: 'tanpaangka' }, 'huruf serta angka'],
      [{ ...valid, password: 'x1'.repeat(37) }, 'maksimal 72'],
      [{ ...valid, email: 'abc12345@x.io', password: 'ABC12345@x.io' }, 'sama dengan email'],
      [{ ...valid, password: undefined }, 'Kata sandi wajib'],
    ];
    for (const [body, message] of bad) expect(() => parseSignUp(body), message).toThrow(message);
    expect(() => parseSignUp('teks')).toThrow('objek JSON');
  });

  it('masuk: email dan kata sandi wajib; kata sandi panjang ditolak sebelum di-hash', () => {
    expect(parseSignIn({ email: 'rina@contoh.id', password: 'x' })).toEqual({ email: 'rina@contoh.id', password: 'x' });
    expect(() => parseSignIn({ email: 'rina@contoh.id', password: 'x'.repeat(10_000) })).toThrow('maksimal 72');
    expect(() => parseSignIn({ email: '', password: 'x' })).toThrow('Email wajib');
  });

  it('token sesi: acak 256 bit, hash SHA-256, dibaca dari cookie hanya bila berbentuk token', () => {
    const token = newSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newSessionToken()).not.toBe(token);
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(readSessionToken(`tema=gelap; ${SESSION_COOKIE}=${token}; x=1`)).toBe(token);
    expect(readSessionToken(`${SESSION_COOKIE}=bukan-token`)).toBeNull();
    expect(readSessionToken(`lain_${SESSION_COOKIE}=${token}`)).toBeNull();
    expect(readSessionToken(undefined)).toBeNull();
  });
});
