import { type CanActivate, type ExecutionContext, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Request } from 'express';
import { LedgrContext } from '../config/ledgr-config';
import { ApiException } from '../errors';
import { type CurrentUser, LOCAL_USER } from './current-user.decorator';
import { IS_PUBLIC } from './public.decorator';

const CACHE_TTL_MS = 5 * 60_000;

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger('Auth');
  private readonly cache = new Map<string, { user: CurrentUser; expires: number }>();
  private supabase: SupabaseClient | null = null;

  constructor(
    private readonly ctx: LedgrContext,
    private readonly reflector: Reflector,
  ) {
    const auth = ctx.config.auth;
    if (auth.mode === 'supabase' && auth.supabaseUrl && auth.supabaseAnonKey) {
      this.supabase = createClient(auth.supabaseUrl, auth.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    } else {
      this.logger.warn('auth.mode = "none": the dashboard is open to anyone who can reach this port. Use only on localhost.');
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const req = context.switchToHttp().getRequest<Request & { user?: CurrentUser }>();

    if (this.ctx.config.auth.mode === 'none' || !this.supabase) {
      req.user = LOCAL_USER;
      return true;
    }

    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Missing bearer token');

    const cached = this.cache.get(token);
    if (cached && cached.expires > Date.now()) {
      req.user = cached.user;
      return true;
    }

    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user) throw new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', error?.message ?? 'Invalid token');
    const role = (data.user.app_metadata as Record<string, unknown> | undefined)?.role;
    if (role !== 'admin') {
      throw new ApiException(HttpStatus.FORBIDDEN, 'NOT_ADMIN', 'Your account is not an admin. Ask the project owner to set app_metadata.role = "admin" in Supabase.');
    }
    const user: CurrentUser = { id: data.user.id, email: data.user.email ?? '', role: 'admin' };
    if (this.cache.size > 500) this.cache.clear();
    this.cache.set(token, { user, expires: Date.now() + CACHE_TTL_MS });
    req.user = user;
    return true;
  }
}
