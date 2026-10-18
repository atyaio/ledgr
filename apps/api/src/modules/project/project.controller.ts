import { Body, Controller, Get, Patch } from '@nestjs/common';
import { updateProjectSchema, type UpdateProjectInput } from '@atyaio/ledgr-shared';
import { type CurrentUser, User } from '../../common/auth/current-user.decorator';
import { zod } from '../../common/zod.pipe';
import { ProjectService } from './project.service';

@Controller('project')
export class ProjectController {
  constructor(private readonly service: ProjectService) {}

  @Get()
  get() {
    return this.service.get();
  }

  @Patch()
  update(@Body(zod(updateProjectSchema)) body: UpdateProjectInput, @User() user: CurrentUser) {
    return this.service.update(body, user);
  }
}
