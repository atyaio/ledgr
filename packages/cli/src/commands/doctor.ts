import * as fs from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { loadApi, resolveWebDist } from '../api.js';
import { hasLocalSource, localSourceBuilt } from '../source.js';

export async function doctorCommand(opts: { dir: string }) {
  const projectDir = path.resolve(opts.dir);
  const standalone = hasLocalSource(projectDir);
  if (standalone && !localSourceBuilt(projectDir)) {
    console.log(`${pc.red('✖')} standalone source present but not built — run ${pc.cyan('pnpm install && pnpm build')} here.`);
    process.exit(1);
  }
  const api = loadApi(projectDir);
  const paths = api.resolvePaths(path.join(projectDir, '.ledgr'));
  const ok = (m: string) => console.log(`${pc.green('✔')} ${m}`);
  const bad = (m: string) => console.log(`${pc.red('✖')} ${m}`);
  const warn = (m: string) => console.log(`${pc.yellow('▲')} ${m}`);
  let failures = 0;

  if (!fs.existsSync(paths.configPath)) {
    bad(`No config at ${paths.configPath}. Run ${pc.cyan('npx ledgr init')}.`);
    process.exit(1);
  }
  let ctx;
  try {
    ctx = api.loadContext(paths.dir);
    ok(`config.json valid · ${ctx.config.name} · ${ctx.config.currency} · auth ${ctx.config.auth.mode}`);
  } catch (e) {
    bad(`config.json: ${(e as Error).message}`);
    process.exit(1);
  }
  if (ctx.config.auth.mode === 'none') warn('auth.mode = none — fine on localhost, not for hosting.');
  try {
    const { applied } = api.runMigrations(paths.dbPath);
    ok(applied.length ? `database migrated (${applied.length} new migration(s))` : 'database up to date');
    const counts = await api.dbCounts(ctx);
    ok(`${counts.stakeholders} stakeholders · ${counts.categories} categories · ${counts.expenses} expenses · ${counts.revenue} revenue`);
    if (!counts.stakeholders) warn('no stakeholders yet — expenses will not be split until you add partners.');
  } catch (e) {
    bad(`database: ${(e as Error).message}`);
    failures++;
  }
  if (standalone) ok('standalone project: using the ledgr source in this folder');
  const web = resolveWebDist(projectDir);
  if (web) ok(`dashboard build found at ${web}`);
  else {
    warn('dashboard build missing (@ledgr/web/dist) — `ledgr start` will serve the API only.');
  }
  console.log(failures ? pc.red(`\n${failures} problem(s).`) : pc.green('\nAll good.'));
  process.exit(failures ? 1 : 0);
}
