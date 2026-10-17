import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  connectLoyverseSchema,
  loyverseSettingsSchema,
  posItemsQuery,
  pullShiftSchema,
  shiftsQuery,
  type ConnectLoyverseInput,
  type IntegrationsResponse,
  type PosItemsQuery,
  type PullShiftInput,
  type ShiftsQuery,
  type UpdateLoyverseSettingsInput,
} from '@ledgr/shared';
import { type CurrentUser, User } from '../../common/auth/current-user.decorator';
import { zod } from '../../common/zod.pipe';
import { LoyverseService } from './loyverse/loyverse.service';

@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly loyverse: LoyverseService) {}

  @Get()
  async list(): Promise<IntegrationsResponse> {
    return { items: [await this.loyverse.status()] };
  }

  // ─── Loyverse ───────────────────────────────────────────────────────────────

  @Get('loyverse')
  status() {
    return this.loyverse.status();
  }

  @Post('loyverse/connect')
  connect(@Body(zod(connectLoyverseSchema)) body: ConnectLoyverseInput, @User() user: CurrentUser) {
    return this.loyverse.connect(body, user);
  }

  @Delete('loyverse')
  @HttpCode(204)
  async disconnect(@User() user: CurrentUser) {
    await this.loyverse.disconnect(user);
  }

  @Put('loyverse/settings')
  settings(@Body(zod(loyverseSettingsSchema)) body: UpdateLoyverseSettingsInput, @User() user: CurrentUser) {
    return this.loyverse.updateSettings(body, user);
  }

  @Post('loyverse/sync-items')
  syncItems(@User() user: CurrentUser) {
    return this.loyverse.syncItems(user);
  }

  @Get('loyverse/items')
  items(@Query(zod(posItemsQuery)) q: PosItemsQuery) {
    return this.loyverse.listItems(q);
  }

  @Get('loyverse/shifts')
  shifts(@Query(zod(shiftsQuery)) q: ShiftsQuery) {
    return this.loyverse.recentShifts(q.limit);
  }

  @Post('loyverse/pull-shift')
  pullShift(@Body(zod(pullShiftSchema)) body: PullShiftInput, @User() user: CurrentUser) {
    return this.loyverse.pullShift(body, user);
  }

  @Get('loyverse/shifts/:shiftId/sales')
  sales(@Param('shiftId') shiftId: string) {
    return this.loyverse.shiftSales(shiftId);
  }
}
