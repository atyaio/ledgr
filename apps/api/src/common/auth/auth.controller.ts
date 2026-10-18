import { Controller, Get } from '@nestjs/common';
import type { AuthConfigResponse, MeResponse } from '@atyaio/ledgr-shared';
import { LedgrContext } from '../config/ledgr-config';
import { type CurrentUser, User } from './current-user.decorator';
import { Public } from './public.decorator';

@Controller()
export class AuthController {
  constructor(private readonly ctx: LedgrContext) {}

  @Public()
  @Get('auth/config')
  config(): AuthConfigResponse {
    const a = this.ctx.config.auth;
    return a.mode === 'supabase' ? { mode: 'supabase', supabaseUrl: a.supabaseUrl, supabaseAnonKey: a.supabaseAnonKey } : { mode: 'none' };
  }

  @Get('me')
  me(@User() user: CurrentUser): MeResponse {
    return user;
  }
}
