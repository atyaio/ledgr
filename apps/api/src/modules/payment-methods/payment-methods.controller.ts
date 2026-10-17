import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { createPaymentMethodSchema, paymentMethodListQuery, reorderSchema, updatePaymentMethodSchema, type CreatePaymentMethodInput, type UpdatePaymentMethodInput } from '@ledgr/shared';
import { z } from 'zod';
import { type CurrentUser, User } from '../../common/auth/current-user.decorator';
import { zod } from '../../common/zod.pipe';
import { PaymentMethodsService } from './payment-methods.service';

@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly service: PaymentMethodsService) {}

  @Get()
  list(@Query(zod(paymentMethodListQuery)) q: z.infer<typeof paymentMethodListQuery>) {
    return this.service.list(q);
  }

  @Post()
  create(@Body(zod(createPaymentMethodSchema)) body: CreatePaymentMethodInput, @User() user: CurrentUser) {
    return this.service.create(body, user);
  }

  @Post('reorder')
  reorder(@Body(zod(reorderSchema)) body: { ids: string[] }, @User() user: CurrentUser) {
    return this.service.reorder(body.ids, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(zod(updatePaymentMethodSchema)) body: UpdatePaymentMethodInput, @User() user: CurrentUser) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @User() user: CurrentUser) {
    await this.service.remove(id, user);
  }
}
