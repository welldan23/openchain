import { PASSWORD_HASH_PATTERN } from '../database/schema/accounts.js';
import { hashPassword, needsRehash, verifyPassword } from './password.js';

describe('hash kata sandi', () => {
  it('hash berformat scrypt yang lolos constraint database, bergaram acak, dan bisa diverifikasi', async () => {
    const hash = await hashPassword('rahasia123');
    expect(hash).toMatch(new RegExp(PASSWORD_HASH_PATTERN));
    expect(hash).not.toContain('rahasia123');
    expect(await hashPassword('rahasia123')).not.toBe(hash);
    expect(await verifyPassword('rahasia123', hash)).toBe(true);
    expect(await verifyPassword('rahasia124', hash)).toBe(false);
    expect(needsRehash(hash)).toBe(false);
  });

  it('bentuk Unicode yang sama dianggap kata sandi yang sama', async () => {
    const hash = await hashPassword('café-123', { N: 2 ** 10, r: 8, p: 1 });
    expect(await verifyPassword('café-123', hash)).toBe(true);
  });

  it('hash rusak, format lain, atau parameter tak wajar ditolak tanpa error', async () => {
    const weak = await hashPassword('x1234567', { N: 2 ** 10, r: 8, p: 1 });
    expect(needsRehash(weak)).toBe(true);
    for (const stored of ['', 'rahasia123', 'bcrypt$2b$10$abc', weak.replace('$1024$', '$1000$'), weak.replace('$1024$', `$${2 ** 20}$`), 'scrypt$1024$8$1$pendek$pendek']) {
      expect(await verifyPassword('x1234567', stored), stored).toBe(false);
      expect(needsRehash(stored)).toBe(true);
    }
  });
});
