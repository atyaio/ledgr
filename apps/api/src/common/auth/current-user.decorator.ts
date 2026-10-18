import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { MeResponse } from '@atyaio/ledgr-shared';

export type CurrentUser = MeResponse;

export const User = createParamDecorator((_data: unknown, ctx: ExecutionContext): CurrentUser => {
  const req = ctx.switchToHttp().getRequest();
  return req.user as CurrentUser;
});

export const LOCAL_USER: CurrentUser = { id: 'local', email: 'local@ledgr', role: 'admin' };
