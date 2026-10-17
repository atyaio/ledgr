import * as path from 'node:path';
import { startApp } from './bootstrap';

export { createApp, startApp, resolveWebDist } from './bootstrap';
export type { StartOptions } from './bootstrap';
export { loadContext, readConfig, writeConfig, defaultConfig, resolvePaths, LedgrContext } from './common/config/ledgr-config';
export type { LedgrPaths } from './common/config/ledgr-config';
export { runMigrations } from './common/prisma/migrator';
export { applyInitialSetup, dbCounts } from './setup';
export type { InitialSetup } from './setup';
export { seedDemo } from './demo-seed';
export type { SeedDemoOptions, SeedDemoResult } from './demo-seed';

if (require.main === module) {
  const dir = process.env.LEDGR_DIR ?? path.join(process.cwd(), '.ledgr');
  startApp({
    dir,
    host: process.env.HOST ?? '127.0.0.1',
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    webDist: process.env.LEDGR_NO_WEB ? null : undefined,
  }).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
