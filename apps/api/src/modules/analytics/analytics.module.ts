import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { StakeholdersModule } from '../stakeholders/stakeholders.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [CategoriesModule, StakeholdersModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
