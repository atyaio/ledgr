import { defineConfig } from 'prisma/config';

// Only used by the Prisma CLI (generate / migrate dev). At runtime ledgr opens the
// SQLite file itself through the better-sqlite3 driver adapter.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? 'file:./dev.db' },
});
