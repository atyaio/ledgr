import * as fs from 'node:fs';
import * as path from 'node:path';
import Database from 'better-sqlite3';

/**
 * Applies the SQL migrations Prisma generated at development time, without needing
 * the Prisma CLI at runtime. Tracks applied migrations in `_ledgr_migrations`.
 */
export function migrationsDir(): string {
  // Works from both src/ (ts-node/jest) and dist/ (compiled): ../../prisma/migrations
  const candidates = [
    path.resolve(__dirname, '../../../prisma/migrations'),
    path.resolve(__dirname, '../../prisma/migrations'),
    path.resolve(__dirname, '../prisma/migrations'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error(`Could not locate prisma/migrations (looked in ${candidates.join(', ')})`);
}

export interface MigrationResult {
  applied: string[];
  pending: number;
}

export function runMigrations(dbPath: string, dir: string = migrationsDir()): MigrationResult {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(`CREATE TABLE IF NOT EXISTS "_ledgr_migrations" ("name" TEXT PRIMARY KEY, "appliedAt" TEXT NOT NULL)`);
    const done = new Set(db.prepare(`SELECT name FROM "_ledgr_migrations"`).all().map((r: any) => r.name as string));
    const names = fs
      .readdirSync(dir)
      .filter((n) => fs.existsSync(path.join(dir, n, 'migration.sql')))
      .sort();
    const applied: string[] = [];
    for (const name of names) {
      if (done.has(name)) continue;
      const sql = fs.readFileSync(path.join(dir, name, 'migration.sql'), 'utf8');
      const tx = db.transaction(() => {
        db.exec(sql);
        db.prepare(`INSERT INTO "_ledgr_migrations" (name, appliedAt) VALUES (?, ?)`).run(name, new Date().toISOString());
      });
      tx();
      applied.push(name);
    }
    return { applied, pending: 0 };
  } finally {
    db.close();
  }
}
