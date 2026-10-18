import { createRequire } from 'node:module';

// The CLI's own manifest: dist/index.js lives one level below package.json, both in the
// workspace and once installed from the registry.
const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { name: string; version: string };

export const PACKAGE_NAME: string = pkg.name;
export const PACKAGE_VERSION: string = pkg.version;

/** True when this binary runs out of npm's `npx` cache rather than a global or project install. */
export function runningFromNpxCache(): boolean {
  return /[\\/]_npx[\\/]/.test(new URL(import.meta.url).pathname);
}
