import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import pc from 'picocolors';
import { hasLocalSource, installAndBuild, run, upgradeSource } from '../source.js';
import { PACKAGE_NAME, PACKAGE_VERSION, runningFromNpxCache } from '../package.js';

export async function upgradeCommand(opts: { dir: string; build?: boolean }) {
  const projectDir = path.resolve(opts.dir);
  if (!hasLocalSource(projectDir)) {
    upgradePackage();
    return;
  }
  console.log(pc.dim('Fetching and merging upstream ledgr/main…'));
  const r = upgradeSource(projectDir);
  if (!r.changed) console.log(pc.green('Already up to date.') + pc.dim(` (${r.after})`));
  else console.log(pc.green(`Merged ${r.before} → ${r.after}.`));
  if (opts.build !== false) {
    console.log(pc.dim('Installing and building…'));
    installAndBuild(projectDir);
  }
  console.log(pc.green('Done.') + pc.dim(' Restart `ledgr start` to pick up the changes.'));
}

/** Shared install: the code lives in the installed npm package, so upgrading means reinstalling it. */
function upgradePackage(): void {
  const spec = `${PACKAGE_NAME}@latest`;
  if (runningFromNpxCache()) {
    console.log(`${pc.green('Nothing to do.')} ${pc.dim(`npx ${PACKAGE_NAME} always runs the latest published version (this one is ${PACKAGE_VERSION}).`)}`);
    console.log(pc.dim(`For a fixed install on a server: ${pc.cyan(`npm install -g ${spec}`)}, then ${pc.cyan('ledgr start')}.`));
    return;
  }
  console.log(pc.dim(`Installed ${PACKAGE_NAME} ${PACKAGE_VERSION}. Running ${pc.cyan(`npm install -g ${spec}`)}…`));
  run('npm', ['install', '-g', spec], process.cwd());
  const after = versionOf(PACKAGE_NAME);
  console.log(pc.green(after && after !== PACKAGE_VERSION ? `Upgraded ${PACKAGE_VERSION} → ${after}.` : `Already up to date (${after ?? PACKAGE_VERSION}).`) + pc.dim(' Restart `ledgr start` to pick up the changes.'));
}

function versionOf(name: string): string | undefined {
  try {
    const r = spawnSync('npm', ['ls', '-g', name, '--json', '--depth=0'], { stdio: 'pipe' });
    const json = JSON.parse(r.stdout.toString() || '{}') as { dependencies?: Record<string, { version?: string }> };
    return json.dependencies?.[name]?.version;
  } catch {
    return undefined;
  }
}
