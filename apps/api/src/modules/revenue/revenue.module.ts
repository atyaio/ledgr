import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { StakeholdersModule } from '../stakeholders/stakeholders.module';
import { RevenueController } from './revenue.controller';
import { RevenueService } from './revenue.service';

@Module({
  imports: [CategoriesModule, StakeholdersModule, CustomFieldsModule],
  controllers: [RevenueController],
  providers: [RevenueService],
  exports: [RevenueService],
})
export class RevenueModule {}
