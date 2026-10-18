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
  `user.app_metadata.role === "admin"`. Non-admins receive `403 { code: "NOT_ADMIN" }`.
- Admins are only granted manually, with SQL in the Supabase SQL Editor (the
  dashboard has no app-metadata editor):
  `update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb) || '{"role":"admin"}'::jsonb where email = '…';`
  A NOT_ADMIN verdict is never cached, so after the update a page reload is
  enough; signing out is not required.
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
| `Expense` | `date, amountMinor (total), description, categoryId, paidByStakeholderId? (null = paid from company pool), vendor?, notes?, splitMode ('ownership'|'custom'), recurringRuleId?, customFields` |
| `ExpensePayment` | amount paid through one method: `expenseId, paymentMethodId, amountMinor` (unique per pair); same rules as `RevenuePayment`. Changing the total re-snapshots the stakeholder split. |
| `ExpenseSplit` | snapshot of how an expense is divided: `expenseId, stakeholderId, sharePercent, amountMinor`. Written for every expense; sum of `amountMinor` == expense amount (largest-remainder rounding). |
| `PaymentMethod` | how revenue is received (Cash, Visa, online…): `name (unique), color, isDefault (one), archived, sortOrder` |
| `Revenue` | `date, amountMinor (total), description, categoryId?, source?, receivedByStakeholderId? (null = company pool), notes?, recurringRuleId?, customFields` |
| `RevenuePayment` | amount received through one method: `revenueId, paymentMethodId, amountMinor` (unique per pair). A revenue row can hold several (cash + visa…); when any exist, `Revenue.amountMinor` is their sum. A bare amount on create goes to the default method. |
| `Settlement` | `date, fromStakeholderId, toStakeholderId? (null = company pool), amountMinor, note?` |
| `CustomFieldDefinition` | `entity ('expense'|'revenue'|'stakeholder'), key (slug), label, type ('text'|'number'|'money'|'date'|'boolean'|'select'), options (JSON string[] for select), required, sortOrder, archived` |
| `RecurringRule` | `kind ('expense'|'revenue'), frequency ('daily'|'weekly'|'monthly'|'quarterly'|'yearly'), interval (Int ≥1), startDate, endDate?, nextRunAt, active, template (JSON: description, amountMinor, categoryId, paidBy/receivedBy, customFields, splitMode, customSplits), lastGeneratedAt?` |
| `AuditLog` | `at, actorId, actorEmail, action ('create'|'update'|'delete'|'import'|'settle'|'recompute'|'generate'), entity, entityId, before (JSON?), after (JSON?)` |
| `Integration` | one row per provider (`loyverse`): `accessToken` (lives in `data.db`, never in `config.json`), `merchantName, currency, decimalPlaces, settings (JSON: storeIds, paymentTypeIds, methodMap, categoryId), meta (JSON: stores, paymentTypes), lastItemsSyncAt, lastShiftPullAt, lastError` |
| `PosCategory` / `PosItem` | cached POS catalogue: `provider, externalId (unique per provider), name`; items carry `categoryId?, sku?, priceMinor?, costMinor?, variantCount, deletedAt?` (soft-deleted when they vanish upstream) |
| `PosShift` | a closed shift pulled into the ledger: `provider, externalId, storeId, storeName?, openedAt, closedAt, raw (JSON: provider shift + per-payment-type amounts + totals), receipts, revenueId? (unique; SetNull when the row is deleted so the shift can be pulled again)` |
| `PosSale` | what sold during a pulled shift, aggregated per item variant: `shiftId, itemId?, externalItemId?, itemName, variantName?, sku?, categoryName?, quantity, grossMinor, netMinor, costMinor` |

Rules:
- Stakeholder shares should total 100%; the API returns `shareTotal` and the UI
  warns when ≠ 100. Splits by ownership normalise by the active stakeholders' total.
- Expense splits are **snapshots**: changing ownership later does not rewrite history.
  `POST /api/expenses/:id/recompute-split` and the bulk variant re-snapshot from
  current ownership (audited).
- Revenue and profit distribution is **computed live** from current shares.
- **Loyverse shift pull**: amounts come from the shift's receipts (same store and POS
  device, created inside the shift window; cancelled receipts skipped; `REFUND`
  receipts subtract). Only the payment types in `settings.paymentTypeIds` (default: the
  cash-like ones — kind `CASH` or a name containing cash/كاش/نقد, e.g. "Talabat cash")
  go on the revenue row, each mapped to a ledgr payment method by `methodMap`; cash-like
  types all fold into the ledger's one Cash method (found by either name, else created),
  other types are matched or created by name. With `settings.subtractPayouts` (default
  true) the shift's cash pay-outs (`paid_out`, PAY_OUT cash movements) come off the
  amount of the `CASH`-kind type, never below zero; the pay-outs are listed on the shift's
  sales response. Row: `date` = local day of `closedAt`
  (`config.timezone`, default the machine zone), `description` = `Shift · store ·
  HH:mm–HH:mm`, `source` = `Loyverse`, category = `settings.categoryId` or the default
  revenue category. Re-pulling the same shift updates that row (date, description,
  payments) and keeps the user's category, notes and custom fields.

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
| payment methods | `GET /payment-methods?includeArchived`, `POST`, `PATCH/:id`, `DELETE/:id` (409 when used), `POST /payment-methods/reorder` |
| categories | `GET/POST /categories?kind`, `PATCH/DELETE /categories/:id`, `GET /categories/budgets?month=YYYY-MM` (budget vs actual) |
| expenses | `GET/POST /expenses` (filter `paymentMethodId`), `PUT /expenses/:id/payments/:methodId { amountMinor }`, `GET/PATCH/DELETE /expenses/:id`, `POST /expenses/:id/recompute-split`, `POST /expenses/recompute-splits` (range), `POST /expenses/bulk-delete` |
| revenue | `GET/POST /revenue` (filter `paymentMethodId`), `GET/PATCH/DELETE /revenue/:id`, `PUT /revenue/:id/payments/:methodId { amountMinor }` (set one method's amount, 0 clears; total follows), `POST /revenue/bulk-delete` |
| settlements | `GET/POST /settlements`, `PATCH/DELETE /settlements/:id`, `GET /settlements/suggest?from&to` |
| custom fields | `GET /custom-fields?entity`, `POST /custom-fields`, `PATCH/DELETE /custom-fields/:id`, `POST /custom-fields/reorder` |
| recurring | `GET/POST /recurring`, `PATCH/DELETE /recurring/:id`, `POST /recurring/run` (generate due entries now), `POST /recurring/:id/run` |
| analytics | `GET /analytics/overview?from&to&granularity=day|week|month` (see §6), `GET /analytics/insights?from&to&ledger=both|revenue|expenses&categoryIds=a,b&paymentMethodIds=x,y&stakeholderId&granularity` → `InsightsResponse` (filtered totals with previous-period deltas, series with previous overlay, breakdowns by category / payment method / partner, weekday averages, month table, top entries; a payment-method filter counts only that method's share of each entry) |
| import/export | `GET /export/:entity.csv?from&to` (entity ∈ expenses, revenue, stakeholders, categories, settlements), `GET /export/template/:entity.csv`, `POST /import/:entity/preview` (multipart `file`) → `{ headers, sampleRows, suggestedMapping, rowCount }`, `POST /import/:entity/commit` (multipart `file` + `mapping` JSON + `options`) → `{ inserted, skipped, errors[] }`, `GET /export/backup.json`, `POST /import/backup` |
| audit | `GET /audit?entity&entityId&page` |
| integrations | `GET /integrations` → `{ items: IntegrationStatus[] }`. Loyverse: `GET /integrations/loyverse` (status, never the token), `POST /integrations/loyverse/connect { accessToken }` (verifies against `/merchant`, 400 `CURRENCY_MISMATCH` / `LOYVERSE_UNAUTHORIZED`), `DELETE /integrations/loyverse`, `PUT /integrations/loyverse/settings { storeIds?, paymentTypeIds?, methodMap?, categoryId? }`, `POST /integrations/loyverse/sync-items` → `{ categories, items, removed }`, `GET /integrations/loyverse/items?q&categoryId&includeDeleted`, `GET /integrations/loyverse/shifts?limit` (closed shifts from Loyverse, newest first, with `pulled`), `POST /integrations/loyverse/pull-shift { shiftId? }` (latest closed when omitted) → `{ revenue, shift, created, sales }`, `GET /integrations/loyverse/shifts/:shiftId/sales`. Set `LEDGR_LOYVERSE_API_BASE` to point the client at a stub. |

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

Routes: `/login`, `/` (Overview), `/insights` (filtered analytics), `/expenses`, `/revenue`, `/stakeholders`
(tabs: Ownership · Balances · Settlements · Distribution), `/categories` (with
budgets), `/recurring`, `/data` (import/export + backup), `/settings` (project,
custom fields, audit log).

Languages: English and Arabic (RTL). `localStorage['ledgr:lang']` persists the choice; `<html lang dir>` follow it. UI strings are keyed by their English text (`apps/web/src/i18n`). Configurable records carry an optional Arabic name (`nameAr` on categories, payment methods, stakeholders; `labelAr` on custom fields; `nameAr` in config.json) shown in Arabic mode, falling back to English. Amounts keep Latin digits (`ar-EG-u-nu-latn`).

Design direction: calm, clean, app-like; light by default, dark follows the system. Tabular
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
