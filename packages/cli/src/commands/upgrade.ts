import * as path from 'node:path';
import pc from 'picocolors';
import { hasLocalSource, installAndBuild, upgradeSource } from '../source.js';

export async function upgradeCommand(opts: { dir: string; build?: boolean }) {
  const projectDir = path.resolve(opts.dir);
  if (!hasLocalSource(projectDir)) {
    throw new Error(`No ledgr source in ${projectDir}. Upgrade applies to standalone projects (ledgr init <folder> --standalone). For shared installs, update the ledgr package itself.`);
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
