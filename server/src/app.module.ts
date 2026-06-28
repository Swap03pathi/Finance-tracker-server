import { Module } from '@nestjs/common';
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
  imports: [PrismaModule, AuthModule, LlmModule, HealthModule, EntriesModule, TemplatesModule, DashboardModule, DevModule],
})
export class AppModule {}
