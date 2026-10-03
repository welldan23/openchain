import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Port 3000 dipakai frontend Next.js, jadi API memakai 4000 secara default.
  await app.listen(process.env.PORT ?? 4000);
}
await bootstrap();
