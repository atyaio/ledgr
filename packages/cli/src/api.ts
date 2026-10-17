import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

// @ledgr/api is a CommonJS build (NestJS). Load it lazily through require so the
// CLI stays ESM and only pays the Nest startup cost for commands that need it.
const require = createRequire(import.meta.url);

export interface LedgrApi {
  startApp(opts: { dir: string; host?: string; port?: number; webDist?: string | null; logger?: boolean }): Promise<{ url: string; close: () => Promise<void>; ctx: LedgrContextLike }>;
  resolveWebDist(): string | undefined;
  loadContext(dir: string): LedgrContextLike;
  readConfig(paths: Paths): ProjectConfigLike;
  writeConfig(paths: Paths, config: ProjectConfigLike): void;
  defaultConfig(partial?: Partial<ProjectConfigLike>): ProjectConfigLike;
  resolvePaths(dir: string): Paths;
  runMigrations(dbPath: string): { applied: string[] };
  applyInitialSetup(ctx: LedgrContextLike, setup: unknown): Promise<{ stakeholders: number; categories: number; customFields: number }>;
  dbCounts(ctx: LedgrContextLike): Promise<{ stakeholders: number; categories: number; expenses: number; revenue: number }>;
  seedDemo?(ctx: LedgrContextLike, opts?: { months?: number; force?: boolean }): Promise<unknown>;
}
export interface Paths { dir: string; configPath: string; dbPath: string }
export interface LedgrContextLike { paths: Paths; config: ProjectConfigLike }
export interface ProjectConfigLike {
  name: string; slug: string; currency: string; locale: string; weekStartsOn: number; fiscalYearStartMonth: number; port: number;
  auth: { mode: 'supabase' | 'none'; supabaseUrl?: string; supabaseAnonKey?: string };
}

export function loadApi(): LedgrApi {
  return require('@ledgr/api') as LedgrApi;
}

export function resolveWebDist(): string | undefined {
  // Resolve from the CLI package first (it depends on @ledgr/web); fall back to the API's own lookup.
  try {
    const pkg = require.resolve('@ledgr/web/package.json');
    const dist = path.join(path.dirname(pkg), 'dist');
    if (fs.existsSync(path.join(dist, 'index.html'))) return dist;
  } catch {
    /* not resolvable from here */
  }
  try {
    return loadApi().resolveWebDist();
  } catch {
    return undefined;
  }
}
