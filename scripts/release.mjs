#!/usr/bin/env node
// Release the four npm packages in dependency order, all at the same version.
//
//   pnpm release                 # patch bump (0.1.0 → 0.1.1), build, publish, commit + tag
//   pnpm release minor|major     # other bumps
//   pnpm release 1.2.3           # explicit version
//   pnpm release --dry-run       # everything except publishing/committing; passes --dry-run to pnpm publish
//   pnpm release --no-git        # publish without committing or tagging
//
// Prerequisites: `npm login` as the owner of the @atyaio scope, a clean git tree (unless --dry-run).
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const noGit = args.includes('--no-git') || dryRun;
const bumpArg = args.find((a) => !a.startsWith('--')) ?? 'patch';

// Publish order matters: each package must exist on the registry before the one depending on it.
const PACKAGES = [
  { dir: 'packages/shared', name: '@atyaio/ledgr-shared' },
  { dir: 'apps/api', name: '@atyaio/ledgr-api' },
  { dir: 'apps/web', name: '@atyaio/ledgr-web' },
  { dir: 'packages/cli', name: '@atyaio/ledgr' },
];

const sh = (cmd, cmdArgs, opts = {}) => {
  console.log(`\n$ ${cmd} ${cmdArgs.join(' ')}`);
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    console.error(`\n${cmd} failed (exit ${r.status}).`);
    process.exit(r.status ?? 1);
  }
};
const out = (cmd, cmdArgs) => execFileSync(cmd, cmdArgs, { cwd: root, encoding: 'utf8' }).trim();
const readPkg = (dir) => JSON.parse(fs.readFileSync(path.join(root, dir, 'package.json'), 'utf8'));
const writePkg = (dir, pkg) => fs.writeFileSync(path.join(root, dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

function bump(current, how) {
  if (/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(how)) return how;
  const [major, minor, patch] = current.split('.').map((n) => parseInt(n, 10));
  if (how === 'major') return `${major + 1}.0.0`;
  if (how === 'minor') return `${major}.${minor + 1}.0`;
  if (how === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown bump "${how}". Use patch, minor, major or an explicit x.y.z.`);
}

// ── Preflight ───────────────────────────────────────────────────────────────
if (!dryRun) {
  if (out('git', ['status', '--porcelain'])) {
    console.error('Working tree is not clean. Commit or stash first (or use --dry-run).');
    process.exit(1);
  }
  const who = spawnSync('npm', ['whoami'], { cwd: root, encoding: 'utf8' });
  if (who.status !== 0) {
    console.error('Not logged in to npm. Run `npm login` as the owner of the @atyaio scope first.');
    process.exit(1);
  }
  console.log(`Publishing as npm user ${who.stdout.trim()}.`);
}

const current = readPkg('packages/cli').version;
const next = bump(current, bumpArg);
console.log(`\nledgr ${current} → ${next}${dryRun ? '  (dry run)' : ''}`);

// ── Version bump: every package moves together ──────────────────────────────
for (const { dir } of PACKAGES) {
  const pkg = readPkg(dir);
  pkg.version = next;
  writePkg(dir, pkg);
}

// ── Build (shared → api + web → cli) ────────────────────────────────────────
sh('pnpm', ['install', '--frozen-lockfile']);
sh('pnpm', ['build']);

// ── Publish in dependency order. pnpm rewrites workspace:* to the exact version. ──
for (const { dir, name } of PACKAGES) {
  const publishArgs = ['publish', '--access', 'public', '--no-git-checks'];
  if (dryRun) publishArgs.push('--dry-run');
  console.log(`\n── ${name}@${next}`);
  sh('pnpm', publishArgs, { cwd: path.join(root, dir) });
}

// ── Commit + tag ────────────────────────────────────────────────────────────
if (dryRun) {
  // Put the manifests back so a dry run leaves no changes behind.
  for (const { dir } of PACKAGES) {
    const pkg = readPkg(dir);
    pkg.version = current;
    writePkg(dir, pkg);
  }
  console.log(`\nDry run complete. Versions restored to ${current}; nothing was published.`);
} else if (noGit) {
  console.log(`\nPublished ${next}. package.json versions changed but not committed (--no-git).`);
} else {
  sh('git', ['add', ...PACKAGES.map((p) => `${p.dir}/package.json`)]);
  sh('git', ['commit', '-m', `release: v${next}`]);
  sh('git', ['tag', `v${next}`]);
  console.log(`\nPublished ${next} and tagged v${next}. Push with: git push && git push --tags`);
}
