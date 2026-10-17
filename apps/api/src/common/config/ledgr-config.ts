import * as fs from 'node:fs';
import * as path from 'node:path';
import { projectConfigSchema, type ProjectConfig } from '@ledgr/shared';

export interface LedgrPaths {
  /** The `.ledgr` directory. */
  dir: string;
  configPath: string;
  dbPath: string;
}

export function resolvePaths(dir: string): LedgrPaths {
  const abs = path.resolve(dir);
  return { dir: abs, configPath: path.join(abs, 'config.json'), dbPath: path.join(abs, 'data.db') };
}

export function defaultConfig(partial: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    name: 'My project',
    slug: 'my-project',
    currency: 'USD',
    locale: 'en-US',
    weekStartsOn: 1,
    fiscalYearStartMonth: 1,
    port: 4848,
    auth: { mode: 'none' },
    ...partial,
  };
}

export function readConfig(paths: LedgrPaths): ProjectConfig {
  if (!fs.existsSync(paths.configPath)) {
    throw new Error(`No ledgr project found at ${paths.dir}. Run \`ledgr init\` first.`);
  }
  const raw = JSON.parse(fs.readFileSync(paths.configPath, 'utf8'));
  const parsed = projectConfigSchema.safeParse({ ...defaultConfig(), ...raw, auth: { mode: 'none', ...(raw.auth ?? {}) } });
  if (!parsed.success) {
    throw new Error(`Invalid ${paths.configPath}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  if (parsed.data.auth.mode === 'supabase' && (!parsed.data.auth.supabaseUrl || !parsed.data.auth.supabaseAnonKey)) {
    throw new Error(`auth.mode is "supabase" but supabaseUrl / supabaseAnonKey are missing in ${paths.configPath}`);
  }
  return parsed.data;
}

export function writeConfig(paths: LedgrPaths, config: ProjectConfig): void {
  fs.mkdirSync(paths.dir, { recursive: true });
  fs.writeFileSync(paths.configPath, JSON.stringify(config, null, 2) + '\n');
}

/** Runtime context shared across the API: where the project lives and its config. */
export class LedgrContext {
  constructor(
    public readonly paths: LedgrPaths,
    private current: ProjectConfig,
  ) {}

  get config(): ProjectConfig {
    return this.current;
  }

  get currency(): string {
    return this.current.currency;
  }

  update(patch: Partial<Omit<ProjectConfig, 'auth'>>): ProjectConfig {
    this.current = { ...this.current, ...patch };
    writeConfig(this.paths, this.current);
    return this.current;
  }
}

export function loadContext(dir: string): LedgrContext {
  const paths = resolvePaths(dir);
  return new LedgrContext(paths, readConfig(paths));
}
