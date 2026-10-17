# ledgr

A self-contained finance dashboard you run inside any project folder.

```bash
cd ~/work/my-startup
npx ledgr init          # asks: name, currency, Supabase auth, stakeholders, categories, custom columns
npx ledgr start --open  # API + dashboard on http://127.0.0.1:4848, data in ./.ledgr/data.db
```

One command per business. Each gets its own SQLite file, its own config and its own
dashboard; nothing is shared with the host project and no database URL is required.

## What it does

- **Expenses & revenue ledgers** with search, filters, sorting, bulk delete and CSV export.
- **Stakeholders with ownership %** — every expense is split by ownership by default, or with
  a custom split per entry. Splits are snapshotted, so changing ownership later never rewrites
  history (re-split on demand).
- **Who paid, who owes** — balances per partner (and the company pool), suggested transfers to
  settle up with the fewest payments, and a settlements ledger.
- **Distribution** — each partner's share of revenue and profit for any period.
- **Analytics overview** for today / week / month / quarter / year / custom ranges, with
  previous-period deltas, cashflow chart, category breakdowns, budgets and largest expenses.
- **Categories & monthly budgets**, **recurring entries** (rent, retainers…), **custom columns**
  (text, number, money, date, yes/no, select) on expenses, revenue and stakeholders.
- **CSV import** with column mapping, date-format detection and duplicate skipping;
  **JSON backup/restore** of the whole project. **Audit log** of every change.
- **Supabase Auth**, admins only (`app_metadata.role = "admin"`, set manually in Supabase).

## Repo layout

```
packages/shared   @ledgr/shared  types, zod schemas, money/split/date/csv utilities (vitest)
apps/api          @ledgr/api     NestJS 12 + Prisma 7 (SQLite via better-sqlite3), REST under /api
apps/web          @ledgr/web     React 19 + Vite + Tailwind 4 dashboard (served by the API)
packages/cli      ledgr          `ledgr init | start | doctor | seed`
```

See [SPEC.md](SPEC.md) for the data model, API and business rules.

## Development

```bash
pnpm install
pnpm build                                  # shared → api + web → cli
pnpm --filter @ledgr/shared test
pnpm --filter @ledgr/api test:e2e

# run against a sample project
mkdir -p /tmp/demo && cd /tmp/demo
node ~/work/ledgr/packages/cli/dist/index.js init --yes --no-auth
node ~/work/ledgr/packages/cli/dist/index.js seed --demo
node ~/work/ledgr/packages/cli/dist/index.js start --open

# hot reload: API on :4848, Vite on :5173 proxying /api
pnpm --filter @ledgr/api dev    # needs LEDGR_DIR=/path/to/.ledgr
pnpm --filter @ledgr/web dev
```

## Hosting a project

`ledgr start --host 0.0.0.0 --port 4848` binds publicly (only do this with Supabase auth on).
The root `Dockerfile` builds the monorepo; mount the project's `.ledgr` folder:

```bash
docker build -t ledgr .
docker run -p 4848:4848 -v "$PWD/.ledgr:/project/.ledgr" ledgr
```

## `.ledgr/config.json`

```jsonc
{
  "name": "Axial", "slug": "axial",
  "currency": "EGP", "locale": "en-EG",
  "weekStartsOn": 6, "fiscalYearStartMonth": 1, "port": 4848,
  "auth": { "mode": "supabase", "supabaseUrl": "https://xxx.supabase.co", "supabaseAnonKey": "…" }
}
```

`auth.mode: "none"` disables sign-in (local use only). Money is stored in integer minor units.
