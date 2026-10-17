import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { RevenueModule } from '../revenue/revenue.module';
import { StakeholdersModule } from '../stakeholders/stakeholders.module';
import { RecurringController } from './recurring.controller';
import { RecurringService } from './recurring.service';

@Module({
  imports: [CategoriesModule, StakeholdersModule, ExpensesModule, RevenueModule],
  controllers: [RecurringController],
  providers: [RecurringService],
  exports: [RecurringService],
})
export class RecurringModule {}
