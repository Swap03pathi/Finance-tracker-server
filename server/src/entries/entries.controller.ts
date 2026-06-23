import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { EntriesUpsertInput, CorrectInput } from '@finman/shared-contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard } from '../common/auth.guard';
import { UserId } from '../common/user.decorator';
import { EntriesService } from './entries.service';

@Controller('entries')
@UseGuards(AuthGuard)
export class EntriesController {
  constructor(private readonly entries: EntriesService) {}

  /** POST /v1/entries { entries[] } — idempotent upsert on device id. */
  @Post()
  upsert(@UserId() userId: string, @Body(new ZodValidationPipe(EntriesUpsertInput)) body: EntriesUpsertInput) {
    return this.entries.upsert(userId, body.entries);
  }

  /** GET /v1/entries?from&to&line — ledger view. */
  @Get()
  list(@UserId() userId: string, @Query('from') from?: string, @Query('to') to?: string, @Query('line') line?: string) {
    return this.entries.list(userId, { from, to, line });
  }

  /** POST /v1/entries/:id/correct — parse-correction (captured stays immutable). */
  @Post(':id/correct')
  correct(
    @UserId() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CorrectInput)) body: CorrectInput,
  ) {
    return this.entries.correct(userId, id, body);
  }
}
