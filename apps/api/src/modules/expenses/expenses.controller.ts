import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  setMethodPaymentSchema,
  bulkIdsSchema,
  createExpenseSchema,
  listQuery,
  rangeQuery,
  updateExpenseSchema,
  type CreateExpenseInput,
  type ListQuery,
  type RangeQuery,
  type UpdateExpenseInput,
} from '@atyaio/ledgr-shared';
import { z } from 'zod';
import { type CurrentUser, User } from '../../common/auth/current-user.decorator';
import { zod } from '../../common/zod.pipe';
import { ExpensesService } from './expenses.service';

type BulkIds = z.infer<typeof bulkIdsSchema>;

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  @Get()
  list(@Query(zod(listQuery)) q: ListQuery) {
    return this.service.list(q);
  }

  @Post()
  create(@Body(zod(createExpenseSchema)) body: CreateExpenseInput, @User() user: CurrentUser) {
    return this.service.create(body, user);
  }

  @Post('recompute-splits')
  recomputeSplits(@Body(zod(rangeQuery)) body: RangeQuery, @User() user: CurrentUser) {
    return this.service.recomputeSplits(body, user);
  }

  @Post('bulk-delete')
  bulkDelete(@Body(zod(bulkIdsSchema)) body: BulkIds, @User() user: CurrentUser) {
    return this.service.bulkDelete(body.ids, user);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Put(':id/payments/:methodId')
  setPayment(@Param('id') id: string, @Param('methodId') methodId: string, @Body(zod(setMethodPaymentSchema)) body: { amountMinor: number }, @User() user: CurrentUser) {
    return this.service.setPayment(id, methodId, body.amountMinor, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(zod(updateExpenseSchema)) body: UpdateExpenseInput, @User() user: CurrentUser) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @User() user: CurrentUser) {
    await this.service.remove(id, user);
  }

  @Post(':id/recompute-split')
  recomputeSplit(@Param('id') id: string, @User() user: CurrentUser) {
    return this.service.recomputeSplit(id, user);
  }
}
