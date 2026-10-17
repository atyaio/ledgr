import 'reflect-metadata';
import { type ExecutionContext, HttpStatus, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { defaultConfig, LedgrContext, resolvePaths } from '../config/ledgr-config';
import { ApiException } from '../errors';
import { AuthGuard } from './auth.guard';
import type { CurrentUser } from './current-user.decorator';
import { IS_PUBLIC } from './public.decorator';

type GetUserResult = { data: { user: SupabaseUser | null }; error: { message: string } | null };
interface SupabaseUser {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
}

/** Unsigned `header.payload.sig` JWT: the guard only decodes `exp`, Supabase is what checks signatures. */
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`;
}

const admin = (id = 'u-admin'): SupabaseUser => ({ id, email: `${id}@example.com`, app_metadata: { role: 'admin' } });
const ok = (user: SupabaseUser): GetUserResult => ({ data: { user }, error: null });

function httpContext(req: { headers: Record<string, string>; user?: CurrentUser }, opts: { isPublic?: boolean } = {}): ExecutionContext {
  const handler = () => undefined;
  class TestController {}
  if (opts.isPublic) Reflect.defineMetadata(IS_PUBLIC, true, handler);
  return {
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

async function expectApiError(promise: Promise<unknown>, status: HttpStatus, code: string): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(ApiException);
  const err = caught as ApiException;
  expect(err.getStatus()).toBe(status);
  expect((err.getResponse() as { code: string }).code).toBe(code);
}

describe('AuthGuard (auth.mode = "supabase")', () => {
  let guard: AuthGuard;
  let getUser: jest.Mock<Promise<GetUserResult>, [string]>;

  beforeEach(() => {
    const config = defaultConfig({ auth: { mode: 'supabase', supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'dummy-anon-key' } });
    guard = new AuthGuard(new LedgrContext(resolvePaths('/tmp/ledgr-auth-guard-spec/.ledgr'), config), new Reflector());
    getUser = jest.fn();
    // Swap the real client (built in the constructor from the dummy URL/key) for a stub.
    (guard as unknown as { supabase: unknown }).supabase = { auth: { getUser } };
  });

  afterEach(() => jest.useRealTimers());

  const activate = (headers: Record<string, string> = {}, opts?: { isPublic?: boolean }) => {
    const req: { headers: Record<string, string>; user?: CurrentUser } = { headers };
    return guard.canActivate(httpContext(req, opts)).then((allowed) => ({ allowed, req }));
  };

  it('lets a @Public() route through without a token and without calling Supabase', async () => {
    const { allowed, req } = await activate({}, { isPublic: true });
    expect(allowed).toBe(true);
    expect(req.user).toBeUndefined();
    expect(getUser).not.toHaveBeenCalled();
  });

  it('rejects a missing bearer token with 401 UNAUTHENTICATED', async () => {
    await expectApiError(activate(), HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED');
    await expectApiError(activate({ authorization: 'Basic abc' }), HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED');
    await expectApiError(activate({ authorization: 'Bearer ' }), HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('rejects a token Supabase does not accept with 401 UNAUTHENTICATED', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid JWT' } });
    await expectApiError(activate({ authorization: 'Bearer bad-token' }), HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED');
    expect(getUser).toHaveBeenCalledWith('bad-token');
  });

  it('rejects a signed-in user without app_metadata.role = "admin" with 403 NOT_ADMIN', async () => {
    getUser.mockResolvedValueOnce(ok({ id: 'u1', email: 'u1@example.com' }));
    await expectApiError(activate({ authorization: 'Bearer t1' }), HttpStatus.FORBIDDEN, 'NOT_ADMIN');
    getUser.mockResolvedValueOnce(ok({ id: 'u2', email: 'u2@example.com', app_metadata: { role: 'viewer' } }));
    await expectApiError(activate({ authorization: 'Bearer t2' }), HttpStatus.FORBIDDEN, 'NOT_ADMIN');
  });

  it('does not cache a NOT_ADMIN verdict, so granting the role takes effect on the next request', async () => {
    getUser.mockResolvedValueOnce(ok({ id: 'u1', email: 'u1@example.com' }));
    await expectApiError(activate({ authorization: 'Bearer same' }), HttpStatus.FORBIDDEN, 'NOT_ADMIN');
    getUser.mockResolvedValueOnce(ok(admin('u1')));
    const { allowed } = await activate({ authorization: 'Bearer same' });
    expect(allowed).toBe(true);
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it('sets req.user for an admin and serves the second request with the same token from the cache', async () => {
    getUser.mockResolvedValue(ok(admin()));
    const first = await activate({ authorization: 'Bearer admin-token' });
    expect(first.allowed).toBe(true);
    expect(first.req.user).toEqual({ id: 'u-admin', email: 'u-admin@example.com', role: 'admin' });

    const second = await activate({ authorization: 'Bearer admin-token' });
    expect(second.allowed).toBe(true);
    expect(second.req.user).toEqual(first.req.user);
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it('does not cache a JWT whose exp is already in the past', async () => {
    getUser.mockResolvedValue(ok(admin()));
    const expired = fakeJwt({ sub: 'u-admin', exp: Math.floor(Date.now() / 1000) - 60 });
    await activate({ authorization: `Bearer ${expired}` });
    await activate({ authorization: `Bearer ${expired}` });
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it('caches a JWT only until its own exp, even inside the 5-minute window', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-17T12:00:00Z') });
    getUser.mockResolvedValue(ok(admin()));
    const soon = fakeJwt({ sub: 'u-admin', exp: Math.floor(Date.now() / 1000) + 60 });
    await activate({ authorization: `Bearer ${soon}` });
    jest.setSystemTime(Date.now() + 30_000);
    await activate({ authorization: `Bearer ${soon}` });
    expect(getUser).toHaveBeenCalledTimes(1);
    jest.setSystemTime(Date.now() + 31_000);
    await activate({ authorization: `Bearer ${soon}` });
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it('expires a cache entry after 5 minutes when the token carries no exp', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-17T12:00:00Z') });
    getUser.mockResolvedValue(ok(admin()));
    await activate({ authorization: 'Bearer opaque' });
    jest.setSystemTime(Date.now() + 5 * 60_000 - 1);
    await activate({ authorization: 'Bearer opaque' });
    expect(getUser).toHaveBeenCalledTimes(1);
    jest.setSystemTime(Date.now() + 2);
    await activate({ authorization: 'Bearer opaque' });
    expect(getUser).toHaveBeenCalledTimes(2);
  });
});

describe('AuthGuard (auth.mode = "none")', () => {
  it('admits every request as the synthetic local admin', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const guard = new AuthGuard(new LedgrContext(resolvePaths('/tmp/ledgr-auth-guard-spec/.ledgr'), defaultConfig()), new Reflector());
    const req: { headers: Record<string, string>; user?: CurrentUser } = { headers: {} };
    expect(await guard.canActivate(httpContext(req))).toBe(true);
    expect(req.user).toEqual({ id: 'local', email: 'local@ledgr', role: 'admin' });
    warn.mockRestore();
  });
});
