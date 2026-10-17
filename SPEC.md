# ledgr — specification

`ledgr` is a self-contained finance dashboard you run inside any project folder.
One command gives a business its own API, SQLite database and React dashboard for
tracking **expenses**, **revenue**, **stakeholders (ownership %)**, **expense
splitting and settlements**, **budgets**, **recurring entries**, **custom columns**,
**CSV import/export** and **analytics** over any date range.

## 1. Runtime model

- `npx ledgr init` (interactive) creates `./.ledgr/` in the current folder:
  - `config.json` — project name, slug, currency, locale, week start, auth, port.
  - `data.db` — SQLite database (Prisma + better-sqlite3 driver adapter).
- `npx ledgr start [--port 4848] [--host 127.0.0.1] [--open]` applies pending
  migrations, starts the NestJS API, serves the built dashboard from the same port
  and opens the browser. `--host 0.0.0.0` + the shipped `Dockerfile` make the same
  folder hostable on a VPS.
- The dashboard never asks the host project for a database URL. Everything lives in
  `.ledgr/`. `init` offers to add `.ledgr/*.db*` to `.gitignore`.
- One currency per project, chosen at init, editable in Settings. Money is stored
  as **integer minor units** (`amountMinor`, e.g. piastres/cents).

### config.json

```jsonc
{
  "name": "Axial",
  "slug": "axial",
  "currency": "EGP",          // ISO 4217
  "locale": "en-EG",          // used for number/date formatting
  "weekStartsOn": 6,          // 0 Sunday … 6 Saturday
  "fiscalYearStartMonth": 1,  // 1 = January
  "port": 4848,
  "auth": {
    "mode": "supabase",       // "supabase" | "none" (local dev only; start prints a warning)
    "supabaseUrl": "https://xxxx.supabase.co",
    "supabaseAnonKey": "..."
  }
}
```

## 2. Auth

- Supabase Auth. The frontend signs in with `@supabase/supabase-js` (email +
  password, magic link also works) and sends `Authorization: Bearer <access_token>`.
- The API verifies the token by calling `supabase.auth.getUser(token)` with the
  anon key (cached in memory per token for 5 minutes) and then requires
  `user.app_metadata.role === "admin"`. Admins are only created manually in the
  Supabase dashboard. Non-admins receive `403 { code: "NOT_ADMIN" }`.
- `GET /api/auth/config` is public and returns `{ mode, supabaseUrl, supabaseAnonKey }`
  so the frontend can bootstrap. `GET /api/me` returns the current user.
- `auth.mode = "none"` skips the guard and reports a synthetic user `local@ledgr`.

## 3. Domain model (Prisma, SQLite)

All ids are `cuid`-style strings. All timestamps ISO. `customFields` columns are
JSON text (`string` in Prisma), validated against the project's
`CustomFieldDefinition`s.

| Model | Purpose / key fields |
|---|---|
| `Stakeholder` | `name, email?, sharePercent (Float, 0–100), active, joinedAt?, notes?, color, customFields` |
| `Category` | `name, kind ('expense'|'revenue'), color, monthlyBudgetMinor? (expense only), archived, sortOrder` |
| `Expense` | `date, amountMinor, description, categoryId, paidByStakeholderId? (null = paid from company pool), vendor?, notes?, splitMode ('ownership'|'custom'), recurringRuleId?, customFields` |
| `ExpenseSplit` | snapshot of how an expense is divided: `expenseId, stakeholderId, sharePercent, amountMinor`. Written for every expense; sum of `amountMinor` == expense amount (largest-remainder rounding). |
| `Revenue` | `date, amountMinor, description, categoryId?, source?, receivedByStakeholderId? (null = company pool), notes?, recurringRuleId?, customFields` |
| `Settlement` | `date, fromStakeholderId, toStakeholderId? (null = company pool), amountMinor, note?` |
| `CustomFieldDefinition` | `entity ('expense'|'revenue'|'stakeholder'), key (slug), label, type ('text'|'number'|'money'|'date'|'boolean'|'select'), options (JSON string[] for select), required, sortOrder, archived` |
| `RecurringRule` | `kind ('expense'|'revenue'), frequency ('daily'|'weekly'|'monthly'|'quarterly'|'yearly'), interval (Int ≥1), startDate, endDate?, nextRunAt, active, template (JSON: description, amountMinor, categoryId, paidBy/receivedBy, customFields, splitMode, customSplits), lastGeneratedAt?` |
| `AuditLog` | `at, actorId, actorEmail, action ('create'|'update'|'delete'|'import'|'settle'|'recompute'|'generate'), entity, entityId, before (JSON?), after (JSON?)` |

Rules:
- Stakeholder shares should total 100%; the API returns `shareTotal` and the UI
  warns when ≠ 100. Splits by ownership normalise by the active stakeholders' total.
- Expense splits are **snapshots**: changing ownership later does not rewrite history.
  `POST /api/expenses/:id/recompute-split` and the bulk variant re-snapshot from
  current ownership (audited).
- Revenue and profit distribution is **computed live** from current shares.

## 4. Balances & settlements

For stakeholder *s* over a range:

```
owed(s)      = Σ ExpenseSplit.amountMinor where stakeholderId = s
paid(s)      = Σ Expense.amountMinor where paidByStakeholderId = s
settledOut(s)= Σ Settlement.amountMinor where fromStakeholderId = s
settledIn(s) = Σ Settlement.amountMinor where toStakeholderId = s
net(s)       = paid(s) − owed(s) + settledOut(s) − settledIn(s)
```

`net > 0` → the pool/others owe *s*; `net < 0` → *s* owes. The API also returns a
greedy debt-simplification list of suggested transfers (`who pays whom how much`)
that zeroes all balances with the fewest payments. The company pool is a virtual
party with id `"pool"`.

## 5. REST API (`/api`, JSON, zod-validated)

Common list query: `from, to (ISO date), q (search), categoryId, stakeholderId,
sort, order, page, pageSize (default 50, max 500)` → `{ items, total, page, pageSize }`.

| Area | Endpoints |
|---|---|
| auth | `GET /auth/config`, `GET /me` |
| project | `GET /project` (config + stats), `PATCH /project` (name, currency, locale, weekStartsOn, fiscalYearStartMonth) |
| stakeholders | `GET/POST /stakeholders`, `GET/PATCH/DELETE /stakeholders/:id`, `GET /stakeholders/balances?from&to`, `GET /stakeholders/distribution?from&to` (revenue/expense/profit share per stakeholder) |
| categories | `GET/POST /categories?kind`, `PATCH/DELETE /categories/:id`, `GET /categories/budgets?month=YYYY-MM` (budget vs actual) |
| expenses | `GET/POST /expenses`, `GET/PATCH/DELETE /expenses/:id`, `POST /expenses/:id/recompute-split`, `POST /expenses/recompute-splits` (range), `POST /expenses/bulk-delete` |
| revenue | `GET/POST /revenue`, `GET/PATCH/DELETE /revenue/:id`, `POST /revenue/bulk-delete` |
| settlements | `GET/POST /settlements`, `PATCH/DELETE /settlements/:id`, `GET /settlements/suggest?from&to` |
| custom fields | `GET /custom-fields?entity`, `POST /custom-fields`, `PATCH/DELETE /custom-fields/:id`, `POST /custom-fields/reorder` |
| recurring | `GET/POST /recurring`, `PATCH/DELETE /recurring/:id`, `POST /recurring/run` (generate due entries now), `POST /recurring/:id/run` |
| analytics | `GET /analytics/overview?from&to&granularity=day|week|month` (see §6) |
| import/export | `GET /export/:entity.csv?from&to` (entity ∈ expenses, revenue, stakeholders, categories, settlements), `GET /export/template/:entity.csv`, `POST /import/:entity/preview` (multipart `file`) → `{ headers, sampleRows, suggestedMapping, rowCount }`, `POST /import/:entity/commit` (multipart `file` + `mapping` JSON + `options`) → `{ inserted, skipped, errors[] }`, `GET /export/backup.json`, `POST /import/backup` |
| audit | `GET /audit?entity&entityId&page` |

Errors: `{ statusCode, code, message, details? }`. Validation errors `400` with zod issues.

### CSV conventions
- Money columns accept `1,234.50`, `1234.5`, `EGP 1,234.50`, `(120.00)` → minor units.
- Dates accept ISO, `DD/MM/YYYY`, `MM/DD/YYYY` (mapping option `dateFormat`), Excel serials.
- `category` and `paidBy`/`receivedBy` match by name (case-insensitive); unknown
  categories are created when `options.createMissingCategories` is true.
- Custom fields map by `key` or `label`. Export emits one column per custom field.
- Round-trip: exporting then importing the same file yields identical rows.

## 6. Analytics overview response

```ts
{
  range: { from, to, granularity, previousFrom, previousTo },
  totals: { revenueMinor, expenseMinor, netMinor, marginPct, expenseCount, revenueCount },
  previous: { revenueMinor, expenseMinor, netMinor },           // same length window before `from`
  delta:    { revenuePct, expensePct, netPct },                   // null when previous is 0
  series: [{ bucket: 'YYYY-MM-DD', revenueMinor, expenseMinor, netMinor, cumulativeNetMinor }],
  expensesByCategory: [{ categoryId, name, color, amountMinor, pct, count }],
  revenueByCategory:  [{ categoryId, name, color, amountMinor, pct, count }],
  topExpenses: [{ id, date, description, amountMinor, categoryName }],      // top 8
  stakeholders: [{ id, name, color, sharePercent, owedMinor, paidMinor, netMinor, revenueShareMinor, profitShareMinor }],
  budgets: [{ categoryId, name, color, budgetMinor, spentMinor, pct }],     // current month of `to`
  pool: { revenueMinor, expenseMinor, netMinor }                            // company-pool side
}
```

Presets on the client map to `from/to`: today, this week (respecting
`weekStartsOn`), this month, this quarter, this year, custom, plus "previous"
navigation. Granularity auto: ≤ 31 days → day, ≤ 26 weeks → week, else month.

## 7. Frontend (React 19 + Vite + Tailwind 4)

Routes: `/login`, `/` (Overview), `/expenses`, `/revenue`, `/stakeholders`
(tabs: Ownership · Balances · Settlements · Distribution), `/categories` (with
budgets), `/recurring`, `/data` (import/export + backup), `/settings` (project,
custom fields, audit log).

Design direction: dark, dense, financial-terminal; light theme toggle. Tabular
numerals everywhere money appears. Global date-range control shared by all pages
via the URL (`?from&to`).

## 8. Monorepo

```
ledgr/
  packages/shared   @ledgr/shared  — types, zod schemas, money/split/date utils (tested)
  apps/api          @ledgr/api     — NestJS 12 + Prisma 7 (better-sqlite3 adapter)
  apps/web          @ledgr/web     — React 19, Vite, Tailwind 4, TanStack Query/Table, Recharts
  packages/cli      ledgr          — bin: init / start / doctor
```
