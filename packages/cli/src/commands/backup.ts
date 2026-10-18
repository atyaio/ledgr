import * as fs from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { loadApi } from '../api.js';

interface Opts { dir: string; out?: string; keep: string }

export async function backupCommand(opts: Opts) {
  const projectDir = path.resolve(opts.dir);
  const api = loadApi(projectDir);
  if (!api.backupDatabase) {
    throw new Error('The installed @ledgr/api is too old for `ledgr backup`. Upgrade the ledgr package (or run `ledgr upgrade` in a standalone folder).');
  }
  const paths = api.resolvePaths(path.join(projectDir, '.ledgr'));
  const ctx = api.loadContext(paths.dir);

  const toFile = !!opts.out && opts.out.endsWith('.db');
  const folder = toFile ? path.dirname(path.resolve(opts.out!)) : path.resolve(opts.out ?? path.join(paths.dir, 'backups'));
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
  const prefix = `${ctx.config.slug}-`;
  const outPath = toFile ? path.resolve(opts.out!) : path.join(folder, `${prefix}${stamp}.db`);

  const { bytes } = await api.backupDatabase(paths.dbPath, outPath);
  console.log(`${pc.green('✔')} ${outPath} ${pc.dim(`(${(bytes / 1024 / 1024).toFixed(1)} MB)`)}`);

  const keep = Number(opts.keep);
  if (!toFile && Number.isFinite(keep) && keep > 0) {
    const old = fs
      .readdirSync(folder)
      .filter((n) => n.startsWith(prefix) && n.endsWith('.db'))
      .sort()
      .slice(0, -keep);
    for (const n of old) fs.rmSync(path.join(folder, n), { force: true });
    if (old.length) console.log(pc.dim(`  pruned ${old.length} older backup(s), keeping ${keep}`));
  }
}
