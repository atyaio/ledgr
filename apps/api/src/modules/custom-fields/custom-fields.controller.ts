import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createCustomFieldSchema,
  customFieldListQuery,
  reorderSchema,
  updateCustomFieldSchema,
  type CreateCustomFieldInput,
  type UpdateCustomFieldInput,
} from '@atyaio/ledgr-shared';
import { z } from 'zod';
import { type CurrentUser, User } from '../../common/auth/current-user.decorator';
import { zod } from '../../common/zod.pipe';
import { CustomFieldsService } from './custom-fields.service';

type ListQ = z.infer<typeof customFieldListQuery>;
type ReorderInput = z.infer<typeof reorderSchema>;

@Controller('custom-fields')
export class CustomFieldsController {
  constructor(private readonly service: CustomFieldsService) {}

  @Get()
  list(@Query(zod(customFieldListQuery)) q: ListQ) {
    return this.service.list(q);
  }

  @Post()
  create(@Body(zod(createCustomFieldSchema)) body: CreateCustomFieldInput, @User() user: CurrentUser) {
    return this.service.create(body, user);
  }

  @Post('reorder')
  reorder(@Body(zod(reorderSchema)) body: ReorderInput, @User() user: CurrentUser) {
    return this.service.reorder(body.ids, user);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(zod(updateCustomFieldSchema)) body: UpdateCustomFieldInput, @User() user: CurrentUser) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @User() user: CurrentUser) {
    await this.service.remove(id, user);
  }
}
