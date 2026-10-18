import * as fs from 'node:fs';
import * as path from 'node:path';
import Database from 'better-sqlite3';

export interface BackupResult {
  path: string;
  bytes: number;
}

/**
 * Consistent copy of the SQLite file while the app keeps running. Uses SQLite's online
 * backup API, so the write-ahead log is included — unlike copying `data.db` by hand.
 * Writes to `<out>.part` first and renames, so a half-written file is never left behind.
 */
export async function backupDatabase(dbPath: string, outPath: string): Promise<BackupResult> {
  if (!fs.existsSync(dbPath)) throw new Error(`No database at ${dbPath}`);
  const out = path.resolve(outPath);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const part = `${out}.part`;
  const db = new Database(dbPath, { fileMustExist: true });
  try {
    await db.backup(part);
  } catch (e) {
    fs.rmSync(part, { force: true });
    throw e;
  } finally {
    db.close();
  }
  fs.renameSync(part, out);
  return { path: out, bytes: fs.statSync(out).size };
}
