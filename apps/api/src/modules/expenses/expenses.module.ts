import { Module } from '@nestjs/common';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';
import { CategoriesModule } from '../categories/categories.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { StakeholdersModule } from '../stakeholders/stakeholders.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';

@Module({
  imports: [CategoriesModule, StakeholdersModule, CustomFieldsModule, PaymentMethodsModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
