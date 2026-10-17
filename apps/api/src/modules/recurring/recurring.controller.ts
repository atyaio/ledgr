import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { createRecurringSchema, updateRecurringSchema, type CreateRecurringInput, type UpdateRecurringInput } from '@ledgr/shared';
import { type CurrentUser, User } from '../../common/auth/current-user.decorator';
import { zod } from '../../common/zod.pipe';
import { RecurringService } from './recurring.service';

@Controller('recurring')
export class RecurringController {
  constructor(private readonly service: RecurringService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body(zod(createRecurringSchema)) body: CreateRecurringInput, @User() user: CurrentUser) {
    return this.service.create(body, user);
  }

  @Post('run')
  runAll(@User() user: CurrentUser) {
    return this.service.run(user);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(zod(updateRecurringSchema)) body: UpdateRecurringInput, @User() user: CurrentUser) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @User() user: CurrentUser) {
    await this.service.remove(id, user);
  }

  @Post(':id/run')
  runOne(@Param('id') id: string, @User() user: CurrentUser) {
    return this.service.run(user, id);
  }
}
