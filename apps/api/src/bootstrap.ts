import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppModule } from './app.module';
import { LedgrContext, loadContext } from './common/config/ledgr-config';
import { ApiExceptionFilter } from './common/http-exception.filter';

export interface StartOptions {
  /** Path to the `.ledgr` directory. */
  dir: string;
  host?: string;
  port?: number;
  /** Absolute path to the built dashboard. Auto-resolved from @ledgr/web when omitted. */
  webDist?: string | null;
  logger?: boolean;
}

export function resolveWebDist(): string | undefined {
  try {
    const pkg = require.resolve('@ledgr/web/package.json');
    const dist = path.join(path.dirname(pkg), 'dist');
    return fs.existsSync(path.join(dist, 'index.html')) ? dist : undefined;
  } catch {
    return undefined;
  }
}

export async function createApp(opts: StartOptions): Promise<{ app: NestExpressApplication; ctx: LedgrContext }> {
  const ctx = loadContext(opts.dir);
  const webDist = opts.webDist === null ? undefined : opts.webDist ?? resolveWebDist();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot({ ctx, webDist }), {
    logger: opts.logger === false ? false : ['log', 'warn', 'error'],
    bufferLogs: false,
  });
  app.setGlobalPrefix('api', { exclude: [] });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableCors({ origin: true, credentials: true });
  app.useBodyParser('json', { limit: '20mb' });
  app.disable('x-powered-by');
  app.enableShutdownHooks();
  return { app, ctx };
}

export async function startApp(opts: StartOptions): Promise<{ url: string; close: () => Promise<void>; ctx: LedgrContext }> {
  const { app, ctx } = await createApp(opts);
  const host = opts.host ?? '127.0.0.1';
  const port = opts.port ?? ctx.config.port ?? 4848;
  await app.listen(port, host);
  const url = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`;
  Logger.log(`${ctx.config.name} dashboard ready at ${url}`, 'ledgr');
  return { url, close: () => app.close(), ctx };
}
