import { Module } from '@nestjs/common';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { BalancesService } from './balances.service';
import { StakeholdersController } from './stakeholders.controller';
import { StakeholdersService } from './stakeholders.service';

@Module({
  imports: [CustomFieldsModule],
  controllers: [StakeholdersController],
  providers: [StakeholdersService, BalancesService],
  exports: [StakeholdersService, BalancesService],
})
export class StakeholdersModule {}
