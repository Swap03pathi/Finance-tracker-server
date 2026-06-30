import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { LlmModule } from './llm/llm.module';
import { EntriesModule } from './entries/entries.module';
import { TemplatesModule } from './templates/templates.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DevModule } from './dev/dev.module';

/**
 * Root module. Feature modules map 1:1 to the doc 03 services. Phase 1 wires auth, entries, templates
 * (+ induction) and dashboard over the pure @finman/engine. Reconciliation/settlement/payee land in
 * their later phases.
 */
@Module({
  imports: [
    // Per-IP rate limit (DoS / abuse floor). 200 req/min is well above any legitimate device cadence
    // — a single device syncs in short bursts, not hundreds of requests a minute. Applied globally
    // via the APP_GUARD below.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),
    PrismaModule, AuthModule, LlmModule, HealthModule, EntriesModule, TemplatesModule, DashboardModule, DevModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
