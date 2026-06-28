import { Module } from '@nestjs/common';
import { DevController } from './dev.controller';
import { DevIngestService } from './dev-ingest.service';
import { TemplatesService } from '../templates/templates.service';
import { EntriesService } from '../entries/entries.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { LineResolverService } from '../persistence/line-resolver.service';

/** DEV/TEST portal — server-side pipeline + logging. Env-gated by ALLOW_DEV_AUTH at the controller. */
@Module({
  controllers: [DevController],
  providers: [DevIngestService, TemplatesService, EntriesService, DashboardService, LineResolverService],
})
export class DevModule {}
