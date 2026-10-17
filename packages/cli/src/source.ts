import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import pc from 'picocolors';

export const UPSTREAM_URL = 'https://github.com/atyaio/ledgr.git';
export const UPSTREAM_REMOTE = 'ledgr';

/** A project folder that carries its own copy of the ledgr source (standalone mode). */
export function hasLocalSource(projectDir: string): boolean {
  return fs.existsSync(path.join(projectDir, 'apps', 'api', 'package.json')) && fs.existsSync(path.join(projectDir, 'packages', 'cli', 'package.json'));
}

export function localSourceBuilt(projectDir: string): boolean {
  return fs.existsSync(path.join(projectDir, 'apps', 'api', 'dist', 'main.js')) && fs.existsSync(path.join(projectDir, 'apps', 'web', 'dist', 'index.html'));
}

export function run(cmd: string, args: string[], cwd: string, opts: { quiet?: boolean } = {}): void {
  const r = spawnSync(cmd, args, { cwd, stdio: opts.quiet ? 'pipe' : 'inherit', env: process.env });
  if (r.status !== 0) {
    const err = opts.quiet ? (r.stderr?.toString() ?? '') : '';
    throw new Error(`${cmd} ${args.join(' ')} failed${err ? `: ${err.trim()}` : ''}`);
  }
}

export function has(cmd: string): boolean {
  const r = spawnSync(cmd, ['--version'], { stdio: 'pipe' });
  return r.status === 0;
}

/**
 * Clone the ledgr source into `dir` (which must not exist or be empty), keeping git
 * history so `ledgr upgrade` can merge upstream later. The upstream remote is named
 * `ledgr`, leaving `origin` free for the project's own repository.
 */
export function cloneSource(dir: string, from: string = UPSTREAM_URL): void {
  if (!has('git')) throw new Error('git is required for --standalone (not found on PATH).');
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) throw new Error(`${dir} is not empty. Use a new folder for a standalone project.`);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  run('git', ['clone', '--origin', UPSTREAM_REMOTE, from, dir], process.cwd());
  // Local clones get the local path as upstream; point the remote at GitHub so upgrades work anywhere.
  if (from !== UPSTREAM_URL) run('git', ['remote', 'set-url', UPSTREAM_REMOTE, UPSTREAM_URL], dir, { quiet: true });
  fs.writeFileSync(path.join(dir, 'ledgr.upstream.json'), JSON.stringify({ repository: UPSTREAM_URL, remote: UPSTREAM_REMOTE, clonedFrom: from, clonedAt: new Date().toISOString() }, null, 2) + '\n');
  run('git', ['add', 'ledgr.upstream.json'], dir, { quiet: true });
  run('git', ['-c', 'user.name=ledgr', '-c', 'user.email=ledgr@localhost', 'commit', '-q', '-m', 'chore: standalone ledgr project'], dir, { quiet: true });
}

export function installAndBuild(dir: string): void {
  if (!has('pnpm')) {
    throw new Error(`pnpm is required to build ledgr. Install it with ${pc.cyan('corepack enable')} (ships with Node) or ${pc.cyan('npm i -g pnpm')}, then run ${pc.cyan('ledgr upgrade')} in the project folder.`);
  }
  run('pnpm', ['install'], dir);
  run('pnpm', ['build'], dir);
}

/** Merge upstream main into the local copy, then rebuild. Conflicts are left for the user to resolve. */
export function upgradeSource(dir: string): { before: string; after: string; changed: boolean } {
  if (!has('git')) throw new Error('git is required (not found on PATH).');
  const rev = () => spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: dir, stdio: 'pipe' }).stdout.toString().trim();
  const before = rev();
  const dirty = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: dir, stdio: 'pipe' }).stdout.toString().trim();
  if (dirty) throw new Error('You have uncommitted changes. Commit or stash them first so the upgrade can be merged cleanly.');
  run('git', ['fetch', UPSTREAM_REMOTE, 'main'], dir);
  const merge = spawnSync('git', ['merge', '--no-edit', '--quiet', `${UPSTREAM_REMOTE}/main`], { cwd: dir, stdio: 'inherit' });
  if (merge.status !== 0) {
    throw new Error(`Merge has conflicts. Resolve them, run ${pc.cyan('git commit')}, then ${pc.cyan('pnpm install && pnpm build')}.`);
  }
  const after = rev();
  return { before, after, changed: before !== after };
}
