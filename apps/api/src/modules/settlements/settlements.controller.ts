import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createSettlementSchema,
  listQuery,
  rangeQuery,
  updateSettlementSchema,
  type CreateSettlementInput,
  type ListQuery,
  type RangeQuery,
  type UpdateSettlementInput,
} from '@ledgr/shared';
import { type CurrentUser, User } from '../../common/auth/current-user.decorator';
import { zod } from '../../common/zod.pipe';
import { BalancesService } from '../stakeholders/balances.service';
import { SettlementsService } from './settlements.service';

@Controller('settlements')
export class SettlementsController {
  constructor(
    private readonly service: SettlementsService,
    private readonly balances: BalancesService,
  ) {}

  @Get()
  list(@Query(zod(listQuery)) q: ListQuery) {
    return this.service.list(q);
  }

  @Get('suggest')
  async suggest(@Query(zod(rangeQuery)) q: RangeQuery) {
    const b = await this.balances.balances(q);
    return { range: b.range, suggestions: b.suggestions, balances: b.balances };
  }

  @Post()
  create(@Body(zod(createSettlementSchema)) body: CreateSettlementInput, @User() user: CurrentUser) {
    return this.service.create(body, user);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(zod(updateSettlementSchema)) body: UpdateSettlementInput, @User() user: CurrentUser) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @User() user: CurrentUser) {
    await this.service.remove(id, user);
  }
}
