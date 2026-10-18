# ledgr

A self-contained finance dashboard you run inside any project folder.

```bash
npm install -g @atyaio/ledgr   # or prefix every command below with `npx @atyaio/ledgr`
cd ~/work/my-startup
ledgr init          # sets up THIS folder: asks name, currency, Supabase auth, partners, categories, custom columns
ledgr init axial    # …or creates ./axial/ with its own .ledgr/
ledgr start --open  # API + dashboard on http://127.0.0.1:4848, data in ./.ledgr/data.db
ledgr upgrade       # npm install -g @atyaio/ledgr@latest
```

Published on npm as [`@atyaio/ledgr`](https://www.npmjs.com/package/@atyaio/ledgr) (the binary is
`ledgr`); the API, dashboard and shared packages ship as `@atyaio/ledgr-api`, `@atyaio/ledgr-web`
and `@atyaio/ledgr-shared` at the same version.

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
- **Payment methods** (cash, cards, online…): each expense and revenue row holds an amount per method side by side; adding revenue fills the default method, the others can be added later from the table. Analytics breakdown and one column per method in Excel/CSV.
- **English and Arabic** with right-to-left layout; the choice is remembered. Categories, payment methods, partners, custom field labels and the project name take an optional Arabic name, with English used when it is blank.
- **Insights page**: filter by ledger, categories, payment methods and partner; previous-period comparison, weekday pattern, month-by-month table, top entries.
- **Categories & monthly budgets**, **recurring entries** (rent, retainers…), **custom columns**
  (text, number, money, date, yes/no, select) on expenses, revenue and stakeholders.
- **CSV import** with column mapping, date-format detection and duplicate skipping;
  **JSON backup/restore** of the whole project. **Audit log** of every change.
- **Loyverse POS integration** (Integrations page): connect with a personal access token, sync the item catalogue with its categories, prices and costs, and on the Revenue page tap **Pull last shift** to turn the latest closed shift into a revenue row. By default only cash-like payment types are pulled and summed into one Cash amount (Loyverse's cash plus custom ones such as "Talabat cash"; switch others on in the settings), and cash pay-outs recorded on the shift are taken off the cash amount; the row keeps what sold by item and category, and Insights shows best sellers across pulled shifts. Re-pulling a shift updates the same row.
- **Supabase Auth**, admins only (`app_metadata.role = "admin"`, granted with SQL on `auth.users`).
- **Mobile-first**: bottom tab bar, bottom-sheet forms, installable as a PWA. `/add/expense` and
  `/add/revenue` open straight into the form (Android app shortcuts, iPhone home-screen links).

## Two ways to use it

**Shared install (default).** `ledgr init` only writes `./.ledgr/` into a project folder; the
code runs from the installed `@atyaio/ledgr` package. `ledgr upgrade` reinstalls the latest
version once and every project on the machine gets it. Nothing to clone.

**Standalone (for projects that will customise ledgr).**

```bash
npx @atyaio/ledgr init my-business --standalone   # clones this repo into ./my-business, builds it, then inits
cd my-business
ledgr start --open                        # runs the folder's own code
ledgr upgrade                             # git fetch + merge from the `ledgr` upstream remote, then rebuild
docker compose --profile hosted up -d --build   # host it with HTTPS (see Hosting); data stays in ./.ledgr
```

The folder is a full git clone with the upstream remote named `ledgr`, so `origin` is free for
the project's own repository. Customise anything under `apps/` and `packages/`; `ledgr upgrade`
merges newer upstream commits into your changes (conflicts are left for you to resolve).
`ledgr start` always prefers the source in the current folder when one is present.

## Repo layout

```
packages/shared   @atyaio/ledgr-shared  types, zod schemas, money/split/date/csv utilities (vitest)
apps/api          @atyaio/ledgr-api     NestJS 12 + Prisma 7 (SQLite via better-sqlite3), REST under /api
apps/web          @atyaio/ledgr-web     React 19 + Vite + Tailwind 4 dashboard (served by the API)
packages/cli      @atyaio/ledgr         bin `ledgr`: init | start | upgrade | doctor | backup | seed
```

See [SPEC.md](SPEC.md) for the data model, API and business rules.

## Development

```bash
pnpm install
pnpm build                                  # shared → api + web → cli
pnpm --filter @atyaio/ledgr-shared test
pnpm --filter @atyaio/ledgr-api test:e2e

# run against a sample project
mkdir -p /tmp/demo && cd /tmp/demo
node ~/work/ledgr/packages/cli/dist/index.js init --yes --no-auth
node ~/work/ledgr/packages/cli/dist/index.js seed --demo
node ~/work/ledgr/packages/cli/dist/index.js start --open

# hot reload: API on :4848, Vite on :5173 proxying /api
pnpm --filter @atyaio/ledgr-api dev    # needs LEDGR_DIR=/path/to/.ledgr
pnpm --filter @atyaio/ledgr-web dev
```

## Hosting a project

### From the npm package (no clone)

On a VPS with Node 20+ (`apt install nodejs` or [nvm](https://github.com/nvm-sh/nvm)):

```bash
npm install -g @atyaio/ledgr
mkdir -p /srv/my-business && cd /srv/my-business
ledgr init                                    # Supabase auth on; copy .ledgr/config.json from your machine instead if it exists
ledgr start --host 127.0.0.1 --port 4848      # put Caddy/nginx in front for HTTPS; never expose auth.mode "none"
```

Keep it running with systemd (`/etc/systemd/system/ledgr-my-business.service`):

```ini
[Unit]
Description=ledgr dashboard for my-business
After=network.target

[Service]
WorkingDirectory=/srv/my-business
ExecStart=/usr/bin/env ledgr start --host 127.0.0.1 --port 4848
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

Upgrade with `ledgr upgrade && systemctl restart ledgr-my-business`. The same works in Docker without
this repo: a three-line image installs the package and runs it against a mounted `.ledgr/`:

```dockerfile
FROM node:22-alpine
RUN npm install -g @atyaio/ledgr@latest
WORKDIR /project
EXPOSE 4848
CMD ["ledgr", "start", "--host", "0.0.0.0", "--port", "4848"]
```

```bash
docker build -t ledgr-npm - < Dockerfile.npm   # or paste the snippet into a file
docker run -d --restart unless-stopped -p 127.0.0.1:4848:4848 -v "$PWD/.ledgr:/project/.ledgr" ledgr-npm
```

### From a standalone folder (customised projects)

One small VPS (2 GB RAM is plenty) with Docker, this folder cloned onto it, and a domain whose
A record points at it. The `hosted` compose profile puts [Caddy](https://caddyserver.com) in front
of the app for automatic HTTPS; the app port itself is only published on the host's loopback.

```bash
cp .env.example .env                              # set LEDGR_DOMAIN
docker compose --profile hosted up -d --build
docker compose --profile hosted logs -f caddy     # watch the certificate get issued
```

Then add `https://<your domain>` under Supabase → Authentication → URL Configuration → Redirect
URLs, or sign-in will bounce. Never host with `auth.mode: "none"`; `ledgr start` and `ledgr doctor`
warn when it is off.

Upgrade a standalone folder with `ledgr upgrade --no-build && docker compose --profile hosted up -d --build`
(a plain clone: `git pull` then the same compose command).

Without Caddy — your own reverse proxy, or a box on the LAN — publish the port directly:
`LEDGR_BIND=0.0.0.0 docker compose up -d --build`, or outside Docker `ledgr start --host 0.0.0.0 --port 4848`
(only with Supabase auth on).

### Backups

`ledgr backup` writes a consistent copy of `data.db` to `.ledgr/backups/<slug>-<timestamp>.db` while
the app is running (SQLite's online backup, so the write-ahead log is included); `--keep 14` prunes
older copies, `--out` picks another folder or file. Do not copy `data.db` by hand while the app is up.

On the server, `deploy/backup.sh` runs it through compose and, when `LEDGR_BACKUP_REMOTE` is set in
`.env`, pushes the folder with [rclone](https://rclone.org) (Cloudflare R2, Backblaze B2, S3, Google Drive…):

```bash
sudo apt install rclone && rclone config          # once: create the remote, e.g. "r2"
crontab -e                                        # then add:
15 3 * * * cd /srv/my-business && ./deploy/backup.sh >> .ledgr/backup.log 2>&1
```

Restore: stop the app, replace `.ledgr/data.db` with a backup file, delete `data.db-wal` and
`data.db-shm` if present, start again.

## `.ledgr/config.json`

```jsonc
{
  "name": "Axial", "slug": "axial",
  "currency": "EGP", "locale": "en-EG",
  "weekStartsOn": 6, "fiscalYearStartMonth": 1, "timezone": "Africa/Cairo", "port": 4848,
  "auth": { "mode": "supabase", "supabaseUrl": "https://xxx.supabase.co", "supabaseAnonKey": "…" }
}
```

`auth.mode: "none"` disables sign-in (local use only). Money is stored in integer minor units. `timezone` (IANA name, written by `ledgr init` from the machine) decides which ledger day a POS shift lands on; the Loyverse token itself lives in `data.db`, never in this file.
