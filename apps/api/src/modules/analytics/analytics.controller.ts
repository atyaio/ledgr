import { Controller, Get, Query } from '@nestjs/common';
import { analyticsQuery, insightsQuery, type AnalyticsQuery, type InsightsQuery } from '@atyaio/ledgr-shared';
import { zod } from '../../common/zod.pipe';
import { AnalyticsService } from './analytics.service';
import { InsightsService } from './insights.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly service: AnalyticsService,
    private readonly insightsService: InsightsService,
  ) {}

  @Get('overview')
  overview(@Query(zod(analyticsQuery)) q: AnalyticsQuery) {
    return this.service.overview(q);
  }

  @Get('insights')
  insights(@Query(zod(insightsQuery)) q: InsightsQuery) {
    return this.insightsService.insights(q);
  }
}
