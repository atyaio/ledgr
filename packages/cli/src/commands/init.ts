import * as fs from 'node:fs';
import * as path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_REVENUE_CATEGORIES, slugifyKey, type CustomFieldEntity, type CustomFieldType } from '@ledgr/shared';
import { loadApi, type ProjectConfigLike } from '../api.js';

interface Opts { dir: string; yes?: boolean; name?: string; currency?: string; auth?: boolean }

const bail = (v: unknown): never => {
  if (p.isCancel(v)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }
  throw new Error('unexpected');
};
const ask = async <T>(v: Promise<T>): Promise<Exclude<T, symbol>> => {
  const r = await v;
  if (p.isCancel(r)) bail(r);
  return r as Exclude<T, symbol>;
};

export async function initCommand(opts: Opts) {
  const api = loadApi();
  const projectDir = path.resolve(opts.dir);
  const paths = api.resolvePaths(path.join(projectDir, '.ledgr'));
  p.intro(pc.bgYellow(pc.black(' ledgr ')) + pc.dim(' init'));

  if (fs.existsSync(paths.configPath)) {
    p.log.warn(`A ledgr project already exists at ${pc.cyan(paths.dir)}`);
    const again = opts.yes ? false : await ask(p.confirm({ message: 'Reconfigure it? (data is kept)', initialValue: false }));
    if (!again) {
      p.outro(`Run ${pc.cyan('npx ledgr start')} to open it.`);
      return;
    }
  }

  const folderName = path.basename(projectDir);
  const name = opts.name ?? (opts.yes ? folderName : await ask(p.text({ message: 'Project / business name', placeholder: folderName, defaultValue: folderName })));
  const currency = (opts.currency ?? (opts.yes ? 'USD' : await ask(p.text({ message: 'Currency (ISO 4217)', placeholder: 'EGP', defaultValue: 'USD', validate: (v) => (v && !/^[A-Za-z]{3}$/.test(v) ? 'Three letters, e.g. EGP' : undefined) })))).toUpperCase();
  const locale = opts.yes ? 'en-US' : await ask(p.text({ message: 'Locale for number & date formatting', placeholder: 'en-EG', defaultValue: 'en-US' }));
  const weekStartsOn = opts.yes ? 1 : await ask(p.select({ message: 'Week starts on', initialValue: 1, options: [{ value: 6, label: 'Saturday' }, { value: 0, label: 'Sunday' }, { value: 1, label: 'Monday' }] }));

  // ── Auth ────────────────────────────────────────────────────────────────────
  let auth: ProjectConfigLike['auth'] = { mode: 'none' };
  const wantAuth = opts.auth === false ? false : opts.yes ? false : await ask(p.confirm({ message: 'Protect the dashboard with Supabase Auth? (admins only)', initialValue: true }));
  if (wantAuth) {
    const supabaseUrl = await ask(p.text({ message: 'Supabase project URL', placeholder: 'https://xxxx.supabase.co', validate: (v) => (/^https?:\/\/.+/.test(v ?? '') ? undefined : 'Enter the project URL') }));
    const supabaseAnonKey = await ask(p.password({ message: 'Supabase anon (public) key', validate: (v) => (v && v.length > 10 ? undefined : 'Paste the anon key') }));
    auth = { mode: 'supabase', supabaseUrl: supabaseUrl.replace(/\/$/, ''), supabaseAnonKey };
    p.note(`Only users with ${pc.cyan('app_metadata.role = "admin"')} can sign in.\nSet it in Supabase → Authentication → Users → (user) → Raw app metadata:\n${pc.dim('{ "role": "admin" }')}`, 'Who gets access');
  } else {
    p.log.warn('No auth: anyone who can reach the port can use the dashboard. Keep it on localhost.');
  }

  // ── Stakeholders ────────────────────────────────────────────────────────────
  const stakeholders: { name: string; sharePercent: number }[] = [];
  if (!opts.yes) {
    const add = await ask(p.confirm({ message: 'Add stakeholders (partners with an ownership %) now?', initialValue: true }));
    let remaining = 100;
    while (add) {
      const sname = await ask(p.text({ message: `Stakeholder ${stakeholders.length + 1} name ${pc.dim('(empty to finish)')}` }));
      if (!sname?.trim()) break;
      const share = await ask(p.text({ message: `${sname}'s ownership %`, defaultValue: String(Math.max(0, remaining)), placeholder: String(Math.max(0, remaining)), validate: (v) => (v && (Number.isNaN(Number(v)) || Number(v) < 0 || Number(v) > 100) ? '0–100' : undefined) }));
      const pct = Number(share || remaining);
      stakeholders.push({ name: sname.trim(), sharePercent: pct });
      remaining = Math.round((remaining - pct) * 100) / 100;
      if (remaining <= 0) {
        const more = await ask(p.confirm({ message: 'Shares reach 100%. Add another anyway?', initialValue: false }));
        if (!more) break;
      }
    }
  }

  // ── Categories ──────────────────────────────────────────────────────────────
  let expenseCategories = [...DEFAULT_EXPENSE_CATEGORIES];
  let revenueCategories = [...DEFAULT_REVENUE_CATEGORIES];
  if (!opts.yes) {
    expenseCategories = await ask(p.multiselect({ message: 'Expense categories to start with', options: DEFAULT_EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c })), initialValues: [...DEFAULT_EXPENSE_CATEGORIES], required: false }));
    const extra = await ask(p.text({ message: `Extra expense categories ${pc.dim('(comma separated, optional)')}`, defaultValue: '' }));
    expenseCategories.push(...(extra ?? '').split(',').map((s) => s.trim()).filter(Boolean));
    revenueCategories = await ask(p.multiselect({ message: 'Revenue categories to start with', options: DEFAULT_REVENUE_CATEGORIES.map((c) => ({ value: c, label: c })), initialValues: [...DEFAULT_REVENUE_CATEGORIES], required: false }));
  }

  // ── Custom columns ──────────────────────────────────────────────────────────
  const customFields: { entity: CustomFieldEntity; label: string; key: string; type: CustomFieldType; options?: string[]; required?: boolean }[] = [];
  if (!opts.yes) {
    const want = await ask(p.confirm({ message: 'Add custom columns (e.g. "Client" on revenue, "Invoice no." on expenses)?', initialValue: true }));
    while (want) {
      const entity = await ask(p.select<CustomFieldEntity | 'done'>({ message: 'Add a column to…', options: [{ value: 'revenue', label: 'Revenue (profit table)' }, { value: 'expense', label: 'Expenses' }, { value: 'stakeholder', label: 'Stakeholders' }, { value: 'done', label: pc.dim('Done adding columns') }] }));
      if (entity === 'done') break;
      const label = await ask(p.text({ message: 'Column label', placeholder: entity === 'revenue' ? 'Client' : entity === 'expense' ? 'Invoice no.' : 'IBAN', validate: (v) => (v?.trim() ? undefined : 'Required') }));
      const type = await ask(p.select<CustomFieldType>({ message: 'Column type', options: [{ value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }, { value: 'money', label: `Money (${currency})` }, { value: 'date', label: 'Date' }, { value: 'boolean', label: 'Yes / no' }, { value: 'select', label: 'Select from options' }] }));
      let options: string[] | undefined;
      if (type === 'select') {
        const raw = await ask(p.text({ message: 'Options (comma separated)', placeholder: 'Direct, Upwork, Referral', validate: (v) => (v?.trim() ? undefined : 'At least one option') }));
        options = raw.split(',').map((s) => s.trim()).filter(Boolean);
      }
      const required = await ask(p.confirm({ message: 'Required?', initialValue: false }));
      let key = slugifyKey(label);
      if (customFields.some((f) => f.entity === entity && f.key === key)) key = `${key}_${customFields.length}`;
      customFields.push({ entity, label: label.trim(), key, type, options, required });
      p.log.success(`${entity} · ${label} (${type})`);
    }
  }

  const port = opts.yes ? 4848 : Number(await ask(p.text({ message: 'Port', defaultValue: '4848', placeholder: '4848', validate: (v) => (v && Number.isNaN(Number(v)) ? 'Number' : undefined) })));

  // ── Write ───────────────────────────────────────────────────────────────────
  const config: ProjectConfigLike = {
    ...api.defaultConfig(),
    name: name.trim(),
    slug: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project',
    currency,
    locale: locale || 'en-US',
    weekStartsOn,
    fiscalYearStartMonth: 1,
    port: port || 4848,
    auth,
  };
  const s = p.spinner();
  s.start('Writing .ledgr/config.json and creating the database');
  api.writeConfig(paths, config);
  const ctx = api.loadContext(paths.dir);
  const result = await api.applyInitialSetup(ctx, { stakeholders, expenseCategories, revenueCategories, customFields });
  s.stop(`Created ${pc.cyan(path.relative(process.cwd(), paths.dir) || '.ledgr')} · ${result.stakeholders} stakeholders · ${result.categories} categories · ${result.customFields} custom columns`);

  // ── .gitignore ──────────────────────────────────────────────────────────────
  const gi = path.join(projectDir, '.gitignore');
  const line = '.ledgr/*.db*';
  const existing = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  if (!existing.split('\n').some((l) => l.trim() === line)) {
    const addIgnore = opts.yes ? true : await ask(p.confirm({ message: `Add ${pc.cyan(line)} to .gitignore? (keeps the database out of git; config.json stays)`, initialValue: true }));
    if (addIgnore) fs.writeFileSync(gi, `${existing.replace(/\n*$/, existing ? '\n' : '')}\n# ledgr database (config.json is safe to commit if it has no secrets)\n${line}\n`);
  }
  if (auth.mode === 'supabase') p.log.info(`${pc.yellow('Note:')} config.json contains the Supabase anon key. It is a public key, but add ${pc.cyan('.ledgr/')} to .gitignore if you prefer to keep it out of the repo.`);

  p.outro(`Done. Run ${pc.cyan('npx ledgr start --open')} to open the dashboard${auth.mode === 'none' ? '' : ' and sign in as an admin'}.`);
}
