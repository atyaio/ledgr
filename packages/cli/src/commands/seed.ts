import * as path from 'node:path';
import pc from 'picocolors';
import { loadApi } from '../api.js';

export async function seedCommand(opts: { dir: string; months: string; force: boolean }) {
  const api = loadApi();
  if (!api.seedDemo) throw new Error('This build of @ledgr/api has no demo seeder.');
  const ctx = api.loadContext(path.join(path.resolve(opts.dir), '.ledgr'));
  console.log(pc.dim(`Seeding ${ctx.config.name} with ${opts.months} months of demo data…`));
  await api.seedDemo(ctx, { months: Number(opts.months) || 12, force: opts.force });
  console.log(pc.green('Demo data loaded.') + pc.dim(' Run `npx ledgr start --open`.'));
  process.exit(0);
}
