import type { Type } from '@nestjs/common';
import { AnalyticsModule } from './analytics/analytics.module';
import { CategoriesModule } from './categories/categories.module';
import { CustomFieldsModule } from './custom-fields/custom-fields.module';
import { ExpensesModule } from './expenses/expenses.module';
import { ImportExportModule } from './import-export/import-export.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { ProjectModule } from './project/project.module';
import { RecurringModule } from './recurring/recurring.module';
import { RevenueModule } from './revenue/revenue.module';
import { SettlementsModule } from './settlements/settlements.module';
import { StakeholdersModule } from './stakeholders/stakeholders.module';

// Domain modules are registered here. Each module owns one area of SPEC.md §5.
export const DOMAIN_MODULES: Type[] = [
  ProjectModule,
  CustomFieldsModule,
  CategoriesModule,
  PaymentMethodsModule,
  StakeholdersModule,
  ExpensesModule,
  RevenueModule,
  SettlementsModule,
  RecurringModule,
  IntegrationsModule,
  AnalyticsModule,
  ImportExportModule,
];
