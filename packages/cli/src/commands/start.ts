import * as path from 'node:path';
import pc from 'picocolors';
import open from 'open';
import { loadApi, resolveWebDist } from '../api.js';
import { hasLocalSource, localSourceBuilt } from '../source.js';

interface Opts { dir: string; port?: string; host: string; open: boolean; apiOnly: boolean }

export async function startCommand(opts: Opts) {
  const projectDir = path.resolve(opts.dir);
  if (hasLocalSource(projectDir) && !localSourceBuilt(projectDir)) {
    throw new Error(`This folder carries its own ledgr source but it is not built. Run ${pc.cyan('pnpm install && pnpm build')} here (or ${pc.cyan('ledgr upgrade')}).`);
  }
  const api = loadApi(projectDir);
  const dir = path.join(projectDir, '.ledgr');
  const webDist = opts.apiOnly ? null : resolveWebDist(projectDir);
  if (!opts.apiOnly && !webDist) {
    console.error(pc.yellow('Dashboard build not found (@ledgr/web/dist). Serving the API only. Run `pnpm build` in the ledgr repo, or use --api-only to silence this.'));
  }
  const { url, ctx } = await api.startApp({ dir, host: opts.host, port: opts.port ? Number(opts.port) : undefined, webDist: webDist ?? null });
  if (ctx.config.auth.mode === 'none' && opts.host !== '127.0.0.1' && opts.host !== 'localhost') {
    console.error(pc.red(`WARNING: auth.mode is "none" and you are binding to ${opts.host}. Anyone who can reach this host can edit the ledger.`));
  }
  console.log(`\n  ${pc.bgYellow(pc.black(' ledgr '))}  ${pc.bold(ctx.config.name)}  →  ${pc.cyan(url)}\n  ${pc.dim(`data: ${ctx.paths.dbPath}`)}${hasLocalSource(projectDir) ? pc.dim('\n  code: this folder (standalone)') : ''}\n`);
  if (opts.open) await open(url);
  const stop = () => process.exit(0);
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
