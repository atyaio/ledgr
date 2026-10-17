import { Module } from '@nestjs/common';
import { StakeholdersModule } from '../stakeholders/stakeholders.module';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';

@Module({
  imports: [StakeholdersModule],
  controllers: [SettlementsController],
  providers: [SettlementsService],
  exports: [SettlementsService],
})
export class SettlementsModule {}
