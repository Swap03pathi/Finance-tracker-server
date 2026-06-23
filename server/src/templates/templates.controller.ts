import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { InduceInput } from '@finman/shared-contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard } from '../common/auth.guard';
import { TemplatesService } from './templates.service';

@Controller('templates')
@UseGuards(AuthGuard)
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  /** GET /v1/templates?since — trusted templates for the device cache. */
  @Get()
  list(@Query('since') since?: string) {
    return this.templates.listTrusted(since);
  }

  /** POST /v1/templates/induce { redactedSkeleton, fingerprint, issuer } — redaction re-asserted server-side. */
  @Post('induce')
  induce(@Body(new ZodValidationPipe(InduceInput)) body: InduceInput) {
    return this.templates.induce(body);
  }
}
