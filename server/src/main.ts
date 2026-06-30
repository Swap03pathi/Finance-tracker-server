import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Security headers. CSP is disabled: this is a JSON API consumed by a native client, and the only
  // HTML surface is the dev-gated /portal (inline handlers). nosniff / frameguard / hidePoweredBy /
  // referrer-policy / HSTS all still apply. HSTS only takes effect once we're behind TLS.
  app.use(helmet({ contentSecurityPolicy: false }));
  // CORS stays OFF (NestFactory default). The device app is not a browser, and the portal is
  // same-origin — so no cross-origin access is ever legitimate. Do NOT enableCors().
  app.setGlobalPrefix('v1', { exclude: ['health', 'portal'] }); // /health + /portal stay unprefixed
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`finman server listening on :${port}/v1`);
}

void bootstrap();
