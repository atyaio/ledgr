import { Controller, Get, Query } from '@nestjs/common';
import { analyticsQuery, type AnalyticsQuery } from '@ledgr/shared';
import { zod } from '../../common/zod.pipe';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get('overview')
  overview(@Query(zod(analyticsQuery)) q: AnalyticsQuery) {
    return this.service.overview(q);
  }
}
