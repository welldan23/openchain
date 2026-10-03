import type { INestApplication } from '@nestjs/common';

/** Pengaturan aplikasi yang sama untuk server sungguhan dan tes e2e. */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api');
  return app;
}
