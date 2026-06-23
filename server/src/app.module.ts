import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';

/**
 * Root module. Feature modules map 1:1 to the services in docs/03-backend-design.md
 * (auth, templates, induction, ledger, reconciliation, settlement, aggregation) and are
 * added phase-by-phase per docs/06-task-list.md. Only PrismaModule exists at the schema stage.
 */
@Module({
  imports: [PrismaModule],
})
export class AppModule {}
