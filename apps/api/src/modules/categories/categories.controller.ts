import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  budgetsQuery,
  categoryListQuery,
  createCategorySchema,
  updateCategorySchema,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from '@ledgr/shared';
import { z } from 'zod';
import { type CurrentUser, User } from '../../common/auth/current-user.decorator';
import { zod } from '../../common/zod.pipe';
import { CategoriesService } from './categories.service';

type ListQ = z.infer<typeof categoryListQuery>;
type BudgetsQ = z.infer<typeof budgetsQuery>;

@Controller('categories')
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  list(@Query(zod(categoryListQuery)) q: ListQ) {
    return this.service.list(q);
  }

  @Get('budgets')
  budgets(@Query(zod(budgetsQuery)) q: BudgetsQ) {
    return this.service.budgets(q.month);
  }

  @Post()
  create(@Body(zod(createCategorySchema)) body: CreateCategoryInput, @User() user: CurrentUser) {
    return this.service.create(body, user);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(zod(updateCategorySchema)) body: UpdateCategoryInput, @User() user: CurrentUser) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @User() user: CurrentUser) {
    await this.service.remove(id, user);
  }
}
