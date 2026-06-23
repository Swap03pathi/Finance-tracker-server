import { Module } from '@nestjs/common';
import { EntriesController } from './entries.controller';
import { EntriesService } from './entries.service';
import { LineResolverService } from '../persistence/line-resolver.service';

@Module({
  controllers: [EntriesController],
  providers: [EntriesService, LineResolverService],
  exports: [LineResolverService],
})
export class EntriesModule {}
