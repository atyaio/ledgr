import { Command } from 'commander';
import pc from 'picocolors';
import { initCommand } from './commands/init.js';
import { startCommand } from './commands/start.js';
import { doctorCommand } from './commands/doctor.js';
import { seedCommand } from './commands/seed.js';
import { upgradeCommand } from './commands/upgrade.js';
import { backupCommand } from './commands/backup.js';
import { PACKAGE_NAME, PACKAGE_VERSION } from './package.js';

const program = new Command();
program
  .name('ledgr')
  .description('Self-contained finance dashboard for any project: expenses, revenue, stakeholders, splits, analytics.')
  .version(PACKAGE_VERSION, '-v, --version', `print the installed ${PACKAGE_NAME} version`);

program
  .command('init [folder]')
  .description('Set up a project: creates <folder>/.ledgr (config + SQLite). Defaults to the current folder.')
  .option('-d, --dir <dir>', 'alias for the folder argument', process.cwd())
  .option('-y, --yes', 'accept defaults without prompting')
  .option('--name <name>', 'project name')
  .option('--currency <code>', 'ISO currency, e.g. EGP')
  .option('--no-auth', 'skip Supabase auth (local only)')
  .option('-s, --standalone', 'also clone the ledgr source into the folder so the project can customise it (upgrade later with `ledgr upgrade`)')
  .option('--from <repoOrPath>', 'where to clone the source from (default: GitHub atyaio/ledgr; a local checkout path works too)')
  .option('--no-build', 'standalone: skip pnpm install && pnpm build')
  .action((folder: string | undefined, opts) => initCommand({ ...opts, dir: folder ?? opts.dir }));

program
  .command('upgrade')
  .description(`Update ledgr: shared installs run npm install -g ${PACKAGE_NAME}@latest; standalone projects merge the latest source from GitHub and rebuild`)
  .option('-d, --dir <dir>', 'project folder', process.cwd())
  .option('--no-build', 'standalone: skip pnpm install && pnpm build after merging')
  .action(upgradeCommand);

program
  .command('start')
  .description('Start the API + dashboard for the project in this folder')
  .option('-d, --dir <dir>', 'project folder containing .ledgr', process.cwd())
  .option('-p, --port <port>', 'port (default: config.port or 4848)')
  .option('-H, --host <host>', 'bind host', '127.0.0.1')
  .option('--open', 'open the dashboard in the browser', false)
  .option('--api-only', 'do not serve the dashboard', false)
  .action(startCommand);

program
  .command('doctor')
  .description('Check config, database and dashboard build')
  .option('-d, --dir <dir>', 'project folder containing .ledgr', process.cwd())
  .action(doctorCommand);

program
  .command('backup')
  .description('Copy the database to a timestamped file; safe while the app is running')
  .option('-d, --dir <dir>', 'project folder containing .ledgr', process.cwd())
  .option('-o, --out <path>', 'target folder, or a file name ending in .db (default: .ledgr/backups/)')
  .option('--keep <n>', 'keep only the newest n backups in the target folder (0 = keep all)', '14')
  .action(backupCommand);

program
  .command('seed')
  .description('Insert demo data (a year of realistic entries) into this project')
  .option('-d, --dir <dir>', 'project folder containing .ledgr', process.cwd())
  .option('--demo', 'load the demo dataset', true)
  .option('--months <n>', 'months of history', '12')
  .option('--force', 'seed even if the ledger already has entries', false)
  .action(seedCommand);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(pc.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
