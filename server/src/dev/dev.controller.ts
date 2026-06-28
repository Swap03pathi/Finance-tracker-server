import { Body, Controller, Get, Header, NotFoundException, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { DevIngestService } from './dev-ingest.service';
import { PORTAL_HTML } from './portal.html';

const DevIngestInput = z.object({
  deviceKey: z.string().min(3).max(128),
  sender: z.string().min(1).max(64),
  body: z.string().min(1).max(2000),
});
type DevIngestInput = z.infer<typeof DevIngestInput>;

/** DEV/TEST portal + endpoints (env-gated by ALLOW_DEV_AUTH). Not behind the JWT guard. */
@Controller()
export class DevController {
  constructor(
    private readonly devIngest: DevIngestService,
    private readonly dashboard: DashboardService,
    private readonly prisma: PrismaService,
  ) {}

  private gate() {
    if (process.env.ALLOW_DEV_AUTH !== 'true') throw new NotFoundException();
  }

  /** The portal page (served unprefixed at /portal). */
  @Get('portal')
  @Header('content-type', 'text/html; charset=utf-8')
  portal(): string {
    this.gate();
    return PORTAL_HTML;
  }

  /** Run the full pipeline over a pasted SMS and return the step-by-step log. */
  @Post('dev/ingest')
  async ingest(@Body(new ZodValidationPipe(DevIngestInput)) body: DevIngestInput) {
    this.gate();
    return this.devIngest.ingest(body.deviceKey, body.sender, body.body);
  }

  /** The three numbers for a device key (no JWT — dev only). */
  @Get('dev/dashboard')
  async devDashboard(@Query('deviceKey') deviceKey: string) {
    this.gate();
    const user = await this.prisma.user.findUnique({ where: { googleSub: `dev:${deviceKey}` } });
    if (!user) return { income: '0.00', expenses: '0.00', savings: '0.00', balances: [], byCategory: [] };
    const dash = await this.dashboard.dashboard(user.id);
    const byCategory = await this.dashboard.breakdown(user.id, 'category');
    return { ...dash, byCategory };
  }
}
