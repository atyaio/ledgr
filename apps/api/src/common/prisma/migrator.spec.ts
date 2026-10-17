import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { migrationsDir, runMigrations } from './migrator';

/**
 * Regression: Prisma's SQLite migrations rebuild tables. Rows referencing a rebuilt
 * table (Revenue → Category) must keep their foreign keys across the migration.
 */
describe('runMigrations', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgr-migrator-'));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('keeps referencing rows intact when a later migration rebuilds a table', () => {
    const all = migrationsDir();
    const names = fs.readdirSync(all).filter((n) => fs.existsSync(path.join(all, n, 'migration.sql'))).sort();
    expect(names.length).toBeGreaterThan(1);
    // Stage 1: only the first migration.
    const stage1 = path.join(tmp, 'stage1');
    fs.mkdirSync(path.join(stage1, names[0]), { recursive: true });
    fs.copyFileSync(path.join(all, names[0], 'migration.sql'), path.join(stage1, names[0], 'migration.sql'));
    const dbPath = path.join(tmp, 'data.db');
    expect(runMigrations(dbPath, stage1).applied).toEqual([names[0]]);

    const db = new Database(dbPath);
    db.prepare(`INSERT INTO "Category" (id, name, kind, updatedAt) VALUES ('c1', 'Sales', 'revenue', CURRENT_TIMESTAMP)`).run();
    db.prepare(`INSERT INTO "Revenue" (id, date, amountMinor, description, categoryId, updatedAt) VALUES ('r1', '2026-01-01', 100, 'x', 'c1', CURRENT_TIMESTAMP)`).run();
    db.prepare(`INSERT INTO "Expense" (id, date, amountMinor, description, categoryId, updatedAt) VALUES ('e1', '2026-01-01', 100, 'y', 'c1', CURRENT_TIMESTAMP)`).run();
    db.close();

    // Stage 2: everything else, which includes table rebuilds of Category and Revenue.
    const res = runMigrations(dbPath, all);
    expect(res.applied).toEqual(names.slice(1));
    const after = new Database(dbPath, { readonly: true });
    expect(after.prepare(`SELECT categoryId FROM "Revenue" WHERE id = 'r1'`).get()).toEqual({ categoryId: 'c1' });
    expect(after.prepare(`SELECT categoryId FROM "Expense" WHERE id = 'e1'`).get()).toEqual({ categoryId: 'c1' });
    expect(after.pragma('foreign_key_check')).toEqual([]);
    expect(after.pragma('foreign_keys', { simple: true })).toBe(1);
    after.close();
  });
});
