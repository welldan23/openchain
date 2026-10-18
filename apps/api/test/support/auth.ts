import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { SESSION_COOKIE } from '../../src/auth/session-token.js';

/** Daftar akun uji dan kembalikan cookie sesinya (`openchain_session=…`). */
export async function signUpCookie(app: INestApplication<App>, email = 'rina@contoh.id', name = 'Rina Analis'): Promise<string> {
  const res = await request(app.getHttpServer()).post('/api/auth/sign-up').send({ name, email, password: 'rahasia123' }).expect(201);
  const header = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((item) => item.startsWith(`${SESSION_COOKIE}=`));
  if (!header) throw new Error('Cookie sesi tidak dipasang saat daftar.');
  return header.split(';')[0];
}

/** Pembuat request yang selalu membawa cookie sesi akun uji. */
export async function signedIn(app: INestApplication<App>, email?: string) {
  const cookie = await signUpCookie(app, email);
  return () => request.agent(app.getHttpServer()).set('Cookie', cookie);
}
