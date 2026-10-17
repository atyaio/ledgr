import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createStakeholderSchema,
  rangeQuery,
  updateStakeholderSchema,
  type CreateStakeholderInput,
  type RangeQuery,
  type UpdateStakeholderInput,
} from '@ledgr/shared';
import { type CurrentUser, User } from '../../common/auth/current-user.decorator';
import { forceQuery, type ForceQuery } from '../../common/query';
import { zod } from '../../common/zod.pipe';
import { BalancesService } from './balances.service';
import { StakeholdersService } from './stakeholders.service';

@Controller('stakeholders')
export class StakeholdersController {
  constructor(
    private readonly service: StakeholdersService,
    private readonly balances: BalancesService,
  ) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get('balances')
  getBalances(@Query(zod(rangeQuery)) q: RangeQuery) {
    return this.balances.balances(q);
  }

  @Get('distribution')
  distribution(@Query(zod(rangeQuery)) q: RangeQuery) {
    return this.balances.distribution(q);
  }

  @Post()
  create(@Body(zod(createStakeholderSchema)) body: CreateStakeholderInput, @User() user: CurrentUser) {
    return this.service.create(body, user);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(zod(updateStakeholderSchema)) body: UpdateStakeholderInput, @User() user: CurrentUser) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @Query(zod(forceQuery)) q: ForceQuery, @User() user: CurrentUser) {
    await this.service.remove(id, user, q.force);
  }
}
