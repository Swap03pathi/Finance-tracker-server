import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import { UserId } from '../common/user.decorator';
import { DashboardService } from './dashboard.service';

@Controller()
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** GET /v1/dashboard — income / expenses / savings + balances, period-honest. */
  @Get('dashboard')
  get(@UserId() userId: string) {
    return this.dashboard.dashboard(userId);
  }

  /** GET /v1/breakdown?by=category|tag|line */
  @Get('breakdown')
  breakdown(@UserId() userId: string, @Query('by') by: 'category' | 'tag' | 'line' = 'category') {
    return this.dashboard.breakdown(userId, by);
  }
}
