import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { ExpensesModule } from '../expenses/expenses.module';
import { RevenueModule } from '../revenue/revenue.module';
import { SettlementsModule } from '../settlements/settlements.module';
import { StakeholdersModule } from '../stakeholders/stakeholders.module';
import { BackupService } from './backup.service';
import { ExportService } from './export.service';
import { ImportExportController } from './import-export.controller';
import { ImportService } from './import.service';
import { XlsxService } from './xlsx.service';

@Module({
  imports: [CustomFieldsModule, CategoriesModule, StakeholdersModule, ExpensesModule, RevenueModule, SettlementsModule],
  controllers: [ImportExportController],
  providers: [ExportService, ImportService, BackupService, XlsxService],
  exports: [ExportService, ImportService, BackupService, XlsxService],
})
export class ImportExportModule {}
