import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  bulkIdsSchema,
  createRevenueSchema,
  listQuery,
  setRevenuePaymentSchema,
  updateRevenueSchema,
  type CreateRevenueInput,
  type ListQuery,
  type UpdateRevenueInput,
} from '@ledgr/shared';
import { z } from 'zod';
import { type CurrentUser, User } from '../../common/auth/current-user.decorator';
import { zod } from '../../common/zod.pipe';
import { RevenueService } from './revenue.service';

type BulkIds = z.infer<typeof bulkIdsSchema>;

@Controller('revenue')
export class RevenueController {
  constructor(private readonly service: RevenueService) {}

  @Get()
  list(@Query(zod(listQuery)) q: ListQuery) {
    return this.service.list(q);
  }

  @Post()
  create(@Body(zod(createRevenueSchema)) body: CreateRevenueInput, @User() user: CurrentUser) {
    return this.service.create(body, user);
  }

  @Post('bulk-delete')
  bulkDelete(@Body(zod(bulkIdsSchema)) body: BulkIds, @User() user: CurrentUser) {
    return this.service.bulkDelete(body.ids, user);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(zod(updateRevenueSchema)) body: UpdateRevenueInput, @User() user: CurrentUser) {
    return this.service.update(id, body, user);
  }

  @Put(':id/payments/:methodId')
  setPayment(@Param('id') id: string, @Param('methodId') methodId: string, @Body(zod(setRevenuePaymentSchema)) body: { amountMinor: number }, @User() user: CurrentUser) {
    return this.service.setPayment(id, methodId, body.amountMinor, user);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @User() user: CurrentUser) {
    await this.service.remove(id, user);
  }
}
