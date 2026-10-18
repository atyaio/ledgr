import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  sourcemap: false,
  banner: { js: '#!/usr/bin/env node' },
  external: [/^@atyaio\/ledgr-/, 'better-sqlite3', '@prisma/client', '@prisma/adapter-better-sqlite3'],
});
