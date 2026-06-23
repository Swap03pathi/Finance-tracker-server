import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';

/**
 * Root module. Feature modules map 1:1 to the services in docs/03-backend-design.md
 * (auth, templates, induction, ledger, reconciliation, settlement, aggregation) and are
 * added phase-by-phase per docs/06-task-list.md. Phase 0 adds HealthModule (deploy check).
 */
@Module({
  imports: [PrismaModule, HealthModule],
})
export class AppModule {}
