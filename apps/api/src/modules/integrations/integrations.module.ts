import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';
import { RevenueModule } from '../revenue/revenue.module';
import { IntegrationsController } from './integrations.controller';
import { LoyverseService } from './loyverse/loyverse.service';

/** Third-party systems feeding the ledger. First provider: Loyverse POS (catalogue + shift pulls). */
@Module({
  imports: [CategoriesModule, PaymentMethodsModule, RevenueModule],
  controllers: [IntegrationsController],
  providers: [LoyverseService],
  exports: [LoyverseService],
})
export class IntegrationsModule {}
