import 'reflect-metadata';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  POOL_ID,
  type AnalyticsOverview,
  type BackupFile,
  type BalancesResponse,
  type Category,
  type Expense,
  type ImportCommitResponse,
  type ImportPreviewResponse,
  type Stakeholder,
} from '@ledgr/shared';
import { createApp } from '../src/bootstrap';
import { defaultConfig, resolvePaths, writeConfig } from '../src/common/config/ledgr-config';

describe('ledgr API (e2e)', () => {
  let app: NestExpressApplication;
  let dir: string;
  const http = () => request(app.getHttpServer());

  const ids = { a: '', b: '', c: '', hosting: '', salaries: '', sales: '' };

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgr-e2e-'));
    const ledgrDir = path.join(dir, '.ledgr');
    writeConfig(resolvePaths(ledgrDir), defaultConfig({ name: 'E2E', slug: 'e2e', currency: 'USD', weekStartsOn: 1, auth: { mode: 'none' } }));
    const created = await createApp({ dir: ledgrDir, webDist: null, logger: false });
    app = created.app;
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // ─── Project ────────────────────────────────────────────────────────────────

  it('GET /api/project returns config without secrets and stats', async () => {
    const res = await http().get('/api/project').expect(200);
    expect(res.body.config.name).toBe('E2E');
    expect(res.body.config.auth).toEqual({ mode: 'none' });
    expect(res.body.stats.shareTotal).toBe(0);
    expect(res.body.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('PATCH /api/project persists config', async () => {
    const res = await http().patch('/api/project').send({ name: 'E2E Studio', weekStartsOn: 6 }).expect(200);
    expect(res.body.config.name).toBe('E2E Studio');
    expect(res.body.config.weekStartsOn).toBe(6);
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, '.ledgr', 'config.json'), 'utf8'));
    expect(onDisk.name).toBe('E2E Studio');
    await http().patch('/api/project').send({ weekStartsOn: 1 }).expect(200);
  });

  // ─── Stakeholders ───────────────────────────────────────────────────────────

  it('stakeholder CRUD and shareTotal', async () => {
    const a = await http().post('/api/stakeholders').send({ name: 'Ada', sharePercent: 50, email: 'ada@example.com' }).expect(201);
    const b = await http().post('/api/stakeholders').send({ name: 'Bob', sharePercent: 30 }).expect(201);
    const c = await http().post('/api/stakeholders').send({ name: 'Cy', sharePercent: 10 }).expect(201);
    ids.a = a.body.id;
    ids.b = b.body.id;
    ids.c = c.body.id;
    expect(a.body.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(a.body.color).not.toBe(b.body.color);

    let list = await http().get('/api/stakeholders').expect(200);
    expect(list.body.items).toHaveLength(3);
    expect(list.body.shareTotal).toBe(90);

    const patched = await http().patch(`/api/stakeholders/${ids.c}`).send({ sharePercent: 20, notes: 'bumped' }).expect(200);
    expect(patched.body.sharePercent).toBe(20);
    expect(patched.body.notes).toBe('bumped');

    list = await http().get('/api/stakeholders').expect(200);
    expect(list.body.shareTotal).toBe(100);

    await http().get('/api/stakeholders/does-not-exist').expect(404);
    await http().post('/api/stakeholders').send({ name: '', sharePercent: 5 }).expect(400);

    // delete an unused stakeholder, then confirm the list shrinks
    const tmp = await http().post('/api/stakeholders').send({ name: 'Temp', sharePercent: 0 }).expect(201);
    await http().delete(`/api/stakeholders/${tmp.body.id}`).expect(204);
    list = await http().get('/api/stakeholders').expect(200);
    expect(list.body.items.map((s: Stakeholder) => s.name)).toEqual(expect.arrayContaining(['Ada', 'Bob', 'Cy']));
    expect(list.body.items).toHaveLength(3);
  });

  // ─── Categories ─────────────────────────────────────────────────────────────

  it('categories with budgets', async () => {
    const hosting = await http().post('/api/categories').send({ name: 'Hosting', kind: 'expense', monthlyBudgetMinor: 100_000 }).expect(201);
    const salaries = await http().post('/api/categories').send({ name: 'Salaries', kind: 'expense' }).expect(201);
    const sales = await http().post('/api/categories').send({ name: 'Sales', kind: 'revenue' }).expect(201);
    ids.hosting = hosting.body.id;
    ids.salaries = salaries.body.id;
    ids.sales = sales.body.id;
    await http().post('/api/categories').send({ name: 'hosting', kind: 'expense' }).expect(409);
    const list = await http().get('/api/categories?kind=expense').expect(200);
    expect(list.body.map((c: Category) => c.name).sort()).toEqual(['Hosting', 'Salaries']);
  });

  // ─── Expenses ───────────────────────────────────────────────────────────────

  it('ownership split sums exactly to the amount and follows shares', async () => {
    const res = await http()
      .post('/api/expenses')
      .send({ date: '2026-03-10', amountMinor: 10_001, description: 'AWS March', categoryId: ids.hosting, paidByStakeholderId: ids.a, vendor: 'AWS' })
      .expect(201);
    const e: Expense = res.body;
    expect(e.splits).toHaveLength(3);
    expect(e.splits.reduce((s, x) => s + x.amountMinor, 0)).toBe(10_001);
    const byId = Object.fromEntries(e.splits.map((s) => [s.stakeholderId, s]));
    expect(byId[ids.a].sharePercent).toBe(50);
    expect(byId[ids.b].amountMinor).toBe(3000);
    expect(byId[ids.c].amountMinor).toBe(2000);
    expect(byId[ids.a].amountMinor).toBe(5001);
    expect(e.category?.name).toBe('Hosting');
    expect(e.paidBy?.name).toBe('Ada');
    expect(byId[ids.a].stakeholderName).toBe('Ada');
  });

  it('rejects invalid custom splits with 400 INVALID_SPLIT', async () => {
    const bad = await http()
      .post('/api/expenses')
      .send({
        date: '2026-03-11',
        amountMinor: 5000,
        description: 'Bad split',
        categoryId: ids.hosting,
        splitMode: 'custom',
        customSplits: [{ stakeholderId: ids.a, sharePercent: 70 }],
      })
      .expect(400);
    expect(bad.body.code).toBe('INVALID_SPLIT');

    const unknown = await http()
      .post('/api/expenses')
      .send({
        date: '2026-03-11',
        amountMinor: 5000,
        description: 'Unknown stakeholder',
        categoryId: ids.hosting,
        splitMode: 'custom',
        customSplits: [{ stakeholderId: ids.a, sharePercent: 50 }, { stakeholderId: 'nope', sharePercent: 50 }],
      })
      .expect(400);
    expect(unknown.body.code).toBe('INVALID_SPLIT');

    const missing = await http()
      .post('/api/expenses')
      .send({ date: '2026-03-11', amountMinor: 5000, description: 'No splits', categoryId: ids.hosting, splitMode: 'custom' })
      .expect(400);
    expect(missing.body.code).toBe('INVALID_SPLIT');

    const ok = await http()
      .post('/api/expenses')
      .send({
        date: '2026-03-12',
        amountMinor: 3333,
        description: 'Custom OK',
        categoryId: ids.salaries,
        splitMode: 'custom',
        customSplits: [{ stakeholderId: ids.a, sharePercent: 50 }, { stakeholderId: ids.b, sharePercent: 50 }],
      })
      .expect(201);
    expect(ok.body.splits.map((s: { amountMinor: number }) => s.amountMinor).sort()).toEqual([1666, 1667]);
  });

  it('wrong-kind category and zod validation are rejected', async () => {
    const wrongKind = await http().post('/api/expenses').send({ date: '2026-03-12', amountMinor: 100, description: 'x', categoryId: ids.sales }).expect(400);
    expect(wrongKind.body.code).toBe('CATEGORY_KIND');
    const zodErr = await http().post('/api/expenses').send({ date: '12/03/2026', amountMinor: 10.5, description: 'x', categoryId: ids.hosting }).expect(400);
    expect(zodErr.body.code).toBe('VALIDATION');
  });

  it('lists with totals over the whole filtered set and updates re-snapshot splits', async () => {
    // one pool-paid expense so the pool has a stake
    await http().post('/api/expenses').send({ date: '2026-03-15', amountMinor: 6000, description: 'Domain renewal', categoryId: ids.hosting }).expect(201);
    const list = await http().get('/api/expenses?from=2026-03-01&to=2026-03-31&pageSize=2').expect(200);
    expect(list.body.items).toHaveLength(2);
    expect(list.body.total).toBe(3);
    expect(list.body.totals).toEqual({ amountMinor: 10_001 + 3333 + 6000, count: 3 });

    const search = await http().get('/api/expenses?q=aws').expect(200);
    expect(search.body.total).toBe(1);
    const byStakeholder = await http().get(`/api/expenses?stakeholderId=${ids.c}`).expect(200);
    expect(byStakeholder.body.total).toBe(2); // Cy is in the two ownership splits, not the custom one

    const target = search.body.items[0] as Expense;
    const updated = await http().patch(`/api/expenses/${target.id}`).send({ amountMinor: 20_000 }).expect(200);
    expect(updated.body.splits.reduce((s: number, x: { amountMinor: number }) => s + x.amountMinor, 0)).toBe(20_000);
    await http().patch(`/api/expenses/${target.id}`).send({ amountMinor: 10_001 }).expect(200);
  });

  // ─── Revenue ────────────────────────────────────────────────────────────────

  it('revenue CRUD', async () => {
    const r = await http()
      .post('/api/revenue')
      .send({ date: '2026-03-20', amountMinor: 50_000, description: 'Acme milestone', categoryId: ids.sales, source: 'Acme' })
      .expect(201);
    expect(r.body.receivedByStakeholderId).toBeNull();
    await http().post('/api/revenue').send({ date: '2026-03-21', amountMinor: 7000, description: 'Consulting', receivedByStakeholderId: ids.b }).expect(201);
    const list = await http().get('/api/revenue?from=2026-03-01&to=2026-03-31').expect(200);
    expect(list.body.totals).toEqual({ amountMinor: 57_000, count: 2 });
    await http().post('/api/revenue').send({ date: '2026-03-20', amountMinor: 1, description: 'x', categoryId: ids.hosting }).expect(400);
  });

  // ─── Balances & settlements ─────────────────────────────────────────────────

  let balancesBefore: BalancesResponse;

  it('balances net to zero across stakeholders and the pool', async () => {
    const res = await http().get('/api/stakeholders/balances').expect(200);
    balancesBefore = res.body;
    const b = balancesBefore;
    expect(b.totalExpenseMinor).toBe(10_001 + 3333 + 6000);
    expect(b.poolPaidMinor).toBe(3333 + 6000); // the custom-split expense has no payer either
    expect(b.balances.map((x) => x.stakeholderId)).toContain(POOL_ID);
    expect(b.balances.reduce((s, x) => s + x.netMinor, 0)).toBe(0);
    const ada = b.balances.find((x) => x.stakeholderId === ids.a)!;
    expect(ada.paidMinor).toBe(10_001);
    expect(ada.owedMinor).toBe(5001 + 1667 + 3000); // 50% of 10001, half of 3333 (largest remainder), 50% of 6000
    expect(ada.netMinor).toBe(ada.paidMinor - ada.owedMinor);
    const pool = b.balances.find((x) => x.stakeholderId === POOL_ID)!;
    expect(pool.netMinor).toBe(9333);
    // suggestions settle everything
    const suggested = b.suggestions.reduce((s, t) => s + t.amountMinor, 0);
    const debts = b.balances.filter((x) => x.netMinor < 0).reduce((s, x) => s - x.netMinor, 0);
    expect(suggested).toBe(debts);
  });

  it('a settlement moves balances and keeps the total at zero', async () => {
    const bob = balancesBefore.balances.find((x) => x.stakeholderId === ids.b)!;
    await http().post('/api/settlements').send({ date: '2026-03-25', fromStakeholderId: ids.b, toStakeholderId: ids.a, amountMinor: 1000 }).expect(201);
    await http().post('/api/settlements').send({ date: '2026-03-26', fromStakeholderId: ids.c, toStakeholderId: null, amountMinor: 500, note: 'to pool' }).expect(201);
    const after: BalancesResponse = (await http().get('/api/stakeholders/balances').expect(200)).body;
    const bobAfter = after.balances.find((x) => x.stakeholderId === ids.b)!;
    expect(bobAfter.settledOutMinor).toBe(1000);
    expect(bobAfter.netMinor).toBe(bob.netMinor + 1000);
    const adaAfter = after.balances.find((x) => x.stakeholderId === ids.a)!;
    expect(adaAfter.settledInMinor).toBe(1000);
    const poolAfter = after.balances.find((x) => x.stakeholderId === POOL_ID)!;
    expect(poolAfter.settledInMinor).toBe(500);
    expect(poolAfter.netMinor).toBe(9333 - 500);
    expect(after.balances.reduce((s, x) => s + x.netMinor, 0)).toBe(0);

    const suggest = await http().get('/api/settlements/suggest?from=2026-03-01&to=2026-03-31').expect(200);
    expect(Array.isArray(suggest.body.suggestions)).toBe(true);
    const list = await http().get('/api/settlements').expect(200);
    expect(list.body.total).toBe(2);
    expect(list.body.items[0].from.name).toBeDefined();
    await http().post('/api/settlements').send({ date: '2026-03-25', fromStakeholderId: ids.b, toStakeholderId: ids.b, amountMinor: 1 }).expect(400);
  });

  it('deleting a stakeholder with records needs force', async () => {
    const res = await http().delete(`/api/stakeholders/${ids.c}`).expect(409);
    expect(res.body.code).toBe('HAS_RECORDS');
  });

  it('distribution splits revenue, expense and profit by share', async () => {
    const res = await http().get('/api/stakeholders/distribution?from=2026-03-01&to=2026-03-31').expect(200);
    expect(res.body.revenueMinor).toBe(57_000);
    expect(res.body.expenseMinor).toBe(19_334);
    expect(res.body.profitMinor).toBe(57_000 - 19_334);
    expect(res.body.shareTotal).toBe(100);
    const sum = (k: 'revenueShareMinor' | 'expenseShareMinor' | 'profitShareMinor') => res.body.items.reduce((s: number, x: Record<string, number>) => s + x[k], 0);
    expect(sum('revenueShareMinor')).toBe(57_000);
    expect(sum('expenseShareMinor')).toBe(19_334);
    expect(sum('profitShareMinor')).toBe(57_000 - 19_334);
  });

  // ─── Analytics ──────────────────────────────────────────────────────────────

  it('analytics overview: totals, series without gaps, previous window', async () => {
    // seed the previous window so deltas are non-null
    await http().post('/api/expenses').send({ date: '2026-02-10', amountMinor: 4000, description: 'Feb hosting', categoryId: ids.hosting }).expect(201);
    await http().post('/api/revenue').send({ date: '2026-02-12', amountMinor: 20_000, description: 'Feb sale', categoryId: ids.sales }).expect(201);

    const res = await http().get('/api/analytics/overview?from=2026-03-01&to=2026-03-31').expect(200);
    const o: AnalyticsOverview = res.body;
    expect(o.range).toEqual({ from: '2026-03-01', to: '2026-03-31', granularity: 'day', previousFrom: '2026-02-01', previousTo: '2026-02-28' });
    expect(o.totals.expenseMinor).toBe(19_334);
    expect(o.totals.revenueMinor).toBe(57_000);
    expect(o.totals.netMinor).toBe(57_000 - 19_334);
    expect(o.totals.expenseCount).toBe(3);
    expect(o.totals.revenueCount).toBe(2);
    expect(o.previous).toEqual({ revenueMinor: 20_000, expenseMinor: 4000, netMinor: 16_000 });
    expect(o.delta.revenuePct).toBe(185);
    expect(o.delta.expensePct).toBeCloseTo(383.35, 2);
    expect(o.series).toHaveLength(31);
    expect(o.series[0].bucket).toBe('2026-03-01');
    expect(o.series[30].bucket).toBe('2026-03-31');
    expect(o.series[30].cumulativeNetMinor).toBe(o.totals.netMinor);
    expect(o.series.reduce((s, x) => s + x.expenseMinor, 0)).toBe(19_334);
    expect(o.expensesByCategory.map((c) => c.name)).toEqual(['Hosting', 'Salaries']);
    expect(o.expensesByCategory.reduce((s, c) => s + c.pct, 0)).toBeCloseTo(100, 1);
    expect(o.revenueByCategory.find((c) => c.categoryId === null)?.amountMinor).toBe(7000);
    expect(o.topExpenses[0].amountMinor).toBe(10_001);
    expect(o.stakeholders).toHaveLength(3);
    expect(o.stakeholders.reduce((s, x) => s + x.revenueShareMinor, 0)).toBe(57_000);
    expect(o.budgets).toEqual([expect.objectContaining({ name: 'Hosting', budgetMinor: 100_000, spentMinor: 16_001 })]);
    expect(o.pool).toEqual({ revenueMinor: 50_000, expenseMinor: 9333, netMinor: 40_667 });

    const weekly = await http().get('/api/analytics/overview?from=2026-01-01&to=2026-03-31').expect(200);
    expect(weekly.body.range.granularity).toBe('week');
    expect(weekly.body.series[0].bucket).toBe('2025-12-29'); // Monday on/before Jan 1 (weekStartsOn = 1)
    const monthly = await http().get('/api/analytics/overview?from=2025-01-01&to=2026-03-31').expect(200);
    expect(monthly.body.range.granularity).toBe('month');
    expect(monthly.body.series).toHaveLength(15);
    await http().get('/api/analytics/overview?from=2026-03-01').expect(400);
  });

  // ─── Custom fields ──────────────────────────────────────────────────────────

  it('custom fields validate values and export columns', async () => {
    const f = await http().post('/api/custom-fields').send({ entity: 'expense', key: 'invoice_no', label: 'Invoice no.', type: 'text' }).expect(201);
    await http().post('/api/custom-fields').send({ entity: 'expense', key: 'invoice_no', label: 'Dup', type: 'text' }).expect(409);
    const sel = await http()
      .post('/api/custom-fields')
      .send({ entity: 'expense', key: 'reimbursable', label: 'Reimbursable', type: 'boolean' })
      .expect(201);
    const bad = await http()
      .post('/api/expenses')
      .send({ date: '2026-03-13', amountMinor: 100, description: 'bad cf', categoryId: ids.hosting, customFields: { reimbursable: 'maybe' } })
      .expect(400);
    expect(bad.body.code).toBe('CUSTOM_FIELDS');
    const ok = await http()
      .post('/api/expenses')
      .send({ date: '2026-03-13', amountMinor: 100, description: 'with cf', categoryId: ids.hosting, customFields: { invoice_no: 'INV-1', reimbursable: 'yes' } })
      .expect(201);
    expect(ok.body.customFields).toEqual({ invoice_no: 'INV-1', reimbursable: true });
    await http().post('/api/custom-fields/reorder').send({ ids: [sel.body.id, f.body.id] }).expect(201);
    const list = await http().get('/api/custom-fields?entity=expense').expect(200);
    expect(list.body.map((x: { key: string }) => x.key)).toEqual(['reimbursable', 'invoice_no']);
  });

  // ─── CSV round-trip ─────────────────────────────────────────────────────────

  it('payment methods: per-method amounts, default, filter, analytics, export columns', async () => {
    const cash = (await http().post('/api/payment-methods').send({ name: 'Cash', isDefault: true }).expect(201)).body;
    const visa = (await http().post('/api/payment-methods').send({ name: 'Visa' }).expect(201)).body;
    await http().post('/api/payment-methods').send({ name: 'cash' }).expect(409);

    // A bare amount goes to the default method.
    const r = (await http().post('/api/revenue').send({ date: '2026-03-10', amountMinor: 7000, description: 'Till sales' }).expect(201)).body;
    expect(r.amountMinor).toBe(7000);
    expect(r.payments).toEqual([expect.objectContaining({ paymentMethodId: cash.id, name: 'Cash', amountMinor: 7000 })]);

    // Add a Visa amount later: the total follows.
    const r2 = (await http().put(`/api/revenue/${r.id}/payments/${visa.id}`).send({ amountMinor: 3000 }).expect(200)).body;
    expect(r2.amountMinor).toBe(10000);
    expect(r2.payments.map((p: { name: string; amountMinor: number }) => [p.name, p.amountMinor])).toEqual([['Cash', 7000], ['Visa', 3000]]);
    // Changing the bare amount on a split entry is ambiguous.
    await http().patch(`/api/revenue/${r.id}`).send({ amountMinor: 1 }).expect(400);
    // Explicit payments on create: total is their sum.
    const r3 = (await http().post('/api/revenue').send({ date: '2026-03-11', description: 'Mixed', payments: [{ paymentMethodId: cash.id, amountMinor: 100 }, { paymentMethodId: visa.id, amountMinor: 50 }] }).expect(201)).body;
    expect(r3.amountMinor).toBe(150);
    await http().post('/api/revenue').send({ date: '2026-03-11', description: 'Nothing' }).expect(400);
    await http().post('/api/revenue').send({ date: '2026-03-11', description: 'Bad', payments: [{ paymentMethodId: 'nope', amountMinor: 5 }] }).expect(404);

    const filtered = (await http().get(`/api/revenue?paymentMethodId=${visa.id}`).expect(200)).body;
    expect(filtered.items.map((x: { id: string }) => x.id).sort()).toEqual([r.id, r3.id].sort());

    const o = (await http().get('/api/analytics/overview?from=2026-03-01&to=2026-03-31').expect(200)).body;
    const cashBucket = o.revenueByPaymentMethod.find((m: { paymentMethodId: string | null }) => m.paymentMethodId === cash.id);
    expect(cashBucket).toMatchObject({ name: 'Cash', amountMinor: 7100, count: 2 });

    // Export: one column per method plus Total; import reads them back.
    const csv = (await http().get('/api/export/revenue.csv?from=2026-03-01&to=2026-03-31').expect(200)).text;
    const [header, first] = csv.split(/\r?\n/);
    expect(header.split(',')).toEqual(expect.arrayContaining(['Cash', 'Visa', 'Total']));
    expect(first).toContain('70.00');
    const imported = await http()
      .post('/api/import/revenue/commit')
      .attach('file', Buffer.from(`Date,Description,Cash,Visa,Total\n2026-03-12,Online order,,55.00,\n2026-03-13,Walk-in,20.00,5.00,25.00\n2026-03-14,Wrong,20.00,5.00,99.00\n`), 'r.csv')
      .field('mapping', JSON.stringify({ date: 'Date', description: 'Description', [`pm:${cash.id}`]: 'Cash', [`pm:${visa.id}`]: 'Visa', amount: 'Total' }))
      .field('options', JSON.stringify({ dateFormat: 'iso', createMissingCategories: true, createMissingStakeholders: false, skipDuplicates: true }))
      .expect(201);
    expect(imported.body.inserted).toBe(2);
    expect(imported.body.errors).toHaveLength(1);
    const online = (await http().get('/api/revenue?q=Online%20order').expect(200)).body.items[0];
    expect(online.amountMinor).toBe(5500);
    expect(online.payments).toEqual([expect.objectContaining({ paymentMethodId: visa.id, amountMinor: 5500 })]);

    await http().delete(`/api/payment-methods/${cash.id}`).expect(409); // in use
    await http().patch(`/api/payment-methods/${cash.id}`).send({ archived: true }).expect(200);
    for (const id of [r.id, r3.id, online.id]) await http().delete(`/api/revenue/${id}`).expect(204);
    const walk = (await http().get('/api/revenue?q=Walk-in').expect(200)).body.items[0];
    await http().delete(`/api/revenue/${walk.id}`).expect(204);
    await http().delete(`/api/payment-methods/${cash.id}`).expect(204);
  });

  it('CSV export → import round-trip', async () => {
    const exp = await http().get('/api/export/expenses.csv?from=2026-01-01&to=2026-12-31').expect(200);
    expect(exp.headers['content-type']).toMatch(/text\/csv/);
    expect(exp.headers['content-disposition']).toBe('attachment; filename="e2e-expenses-2026-01-01_2026-12-31.csv"');
    const csv = exp.text;
    const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
    const rowCount = lines.length - 1;
    const before = await http().get('/api/expenses?pageSize=500').expect(200);
    expect(rowCount).toBe(before.body.total);
    expect(lines[0]).toBe('Date,Description,Category,Paid by,Reimbursable,Invoice no.,Amount,Vendor,Notes');

    const preview = await http().post('/api/import/expenses/preview').attach('file', Buffer.from(csv), 'expenses.csv').expect(201);
    const p: ImportPreviewResponse = preview.body;
    expect(p.rowCount).toBe(rowCount);
    expect(p.sampleRows.length).toBeLessThanOrEqual(5);
    expect(p.suggestedMapping).toMatchObject({ date: 'Date', amount: 'Amount', description: 'Description', category: 'Category', paidBy: 'Paid by', 'cf:invoice_no': 'Invoice no.' });
    expect(p.detectedDateFormat).toBe('iso');

    // wipe, then import: every row comes back with zero errors
    await http().post('/api/expenses/bulk-delete').send({ ids: before.body.items.map((e: Expense) => e.id) }).expect(201);
    expect((await http().get('/api/expenses').expect(200)).body.total).toBe(0);

    const commit = await http()
      .post('/api/import/expenses/commit')
      .attach('file', Buffer.from(csv), 'expenses.csv')
      .field('mapping', JSON.stringify(p.suggestedMapping))
      .field('options', JSON.stringify({ dateFormat: 'iso', createMissingCategories: true, createMissingStakeholders: false, skipDuplicates: true }))
      .expect(201);
    const c: ImportCommitResponse = commit.body;
    expect(c.errors).toEqual([]);
    expect(c.inserted).toBe(rowCount);
    expect(c.skipped).toBe(0);

    const after = await http().get('/api/expenses?pageSize=500').expect(200);
    expect(after.body.total).toBe(rowCount);
    expect(after.body.totals.amountMinor).toBe(before.body.totals.amountMinor);
    for (const e of after.body.items as Expense[]) expect(e.splits.reduce((s, x) => s + x.amountMinor, 0)).toBe(e.amountMinor);
    const withCf = (after.body.items as Expense[]).find((e) => e.description === 'with cf')!;
    expect(withCf.customFields).toEqual({ invoice_no: 'INV-1', reimbursable: true });
    const paidByAda = (after.body.items as Expense[]).find((e) => e.description === 'AWS March')!;
    expect(paidByAda.paidByStakeholderId).toBe(ids.a);

    // exporting again yields the identical file
    const again = await http().get('/api/export/expenses.csv?from=2026-01-01&to=2026-12-31').expect(200);
    expect(again.text).toBe(csv);

    // second import: everything is a duplicate
    const dup = await http()
      .post('/api/import/expenses/commit')
      .attach('file', Buffer.from(csv), 'expenses.csv')
      .field('mapping', JSON.stringify(p.suggestedMapping))
      .expect(201);
    expect(dup.body).toEqual({ inserted: 0, skipped: rowCount, errors: [] });

    // messy input: EU money, DMY date, unknown stakeholder, negative amount
    const messy = ['Date,Amount,Description,Category,Paid by', '05/04/2026,"$1,250.50",Figma,Design,Ada', '2026-04-06,(20.00),Refund,Design,', '2026-04-07,15,Zed,Design,Nobody'].join('\n');
    const m = await http()
      .post('/api/import/expenses/commit')
      .attach('file', Buffer.from(messy), 'messy.csv')
      .field('mapping', JSON.stringify({ date: 'Date', amount: 'Amount', description: 'Description', category: 'Category', paidBy: 'Paid by' }))
      .field('options', JSON.stringify({ dateFormat: 'dmy' }))
      .expect(201);
    expect(m.body.inserted).toBe(1);
    expect(m.body.errors.map((e: { row: number }) => e.row)).toEqual([3, 4]);
    const figma = await http().get('/api/expenses?q=figma').expect(200);
    expect(figma.body.items[0]).toMatchObject({ date: '2026-04-05', amountMinor: 125_050, category: expect.objectContaining({ name: 'Design' }) });

    // Excel export carries the same columns, dropdown validations, and imports back cleanly.
    const x = await http().get('/api/export/expenses.xlsx?from=2026-01-01&to=2026-12-31').buffer().parse((res, cb) => { const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); }).expect(200);
    expect(x.headers['content-type']).toMatch(/spreadsheetml/);
    const xbuf = x.body as Buffer;
    expect(xbuf.subarray(0, 2).toString()).toBe('PK');
    const current = (await http().get('/api/export/expenses.csv?from=2026-01-01&to=2026-12-31').expect(200)).text.split(/\r?\n/).filter((l) => l.length > 0).length - 1;
    const xp = await http().post('/api/import/expenses/preview').attach('file', xbuf, 'expenses.xlsx').expect(201);
    expect(xp.body.headers).toEqual(['Date', 'Description', 'Category', 'Paid by', 'Reimbursable', 'Invoice no.', 'Amount', 'Vendor', 'Notes']);
    expect(xp.body.rowCount).toBe(current);
    expect(xp.body.sampleRows[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const xc = await http()
      .post('/api/import/expenses/commit')
      .attach('file', xbuf, 'expenses.xlsx')
      .field('mapping', JSON.stringify(xp.body.suggestedMapping))
      .field('options', JSON.stringify({ dateFormat: 'auto', createMissingCategories: false, createMissingStakeholders: false, skipDuplicates: true }))
      .expect(201);
    expect(xc.body.errors).toEqual([]);
    expect(xc.body.inserted).toBe(0); // all already present → skipped
    expect(xc.body.skipped).toBe(current);
    const xt = await http().get('/api/export/template/expenses.xlsx').expect(200);
    expect(xt.headers['content-type']).toMatch(/spreadsheetml/);

    const template = await http().get('/api/export/template/revenue.csv').expect(200);
    expect(template.text.split(/\r?\n/)).toHaveLength(2);
    await http().get('/api/export/nope.csv').expect(400);
  });

  // ─── Recurring ──────────────────────────────────────────────────────────────

  it('recurring rules generate due entries once', async () => {
    const rule = await http()
      .post('/api/recurring')
      .send({
        kind: 'revenue',
        name: 'Retainer',
        frequency: 'monthly',
        startDate: '2026-01-15',
        endDate: '2026-03-15',
        template: { description: 'Retainer', amountMinor: 9000, categoryId: ids.sales },
      })
      .expect(201);
    expect(rule.body.nextRunAt).toBe('2026-01-15');
    const run = await http().post(`/api/recurring/${rule.body.id}/run`).expect(201);
    expect(run.body.generated.map((g: { date: string }) => g.date)).toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
    const after = await http().get(`/api/recurring/${rule.body.id}`).expect(200);
    expect(after.body.generatedCount).toBe(3);
    expect(after.body.active).toBe(false);
    expect(after.body.lastGeneratedAt).toBe('2026-03-15');
    const second = await http().post('/api/recurring/run').expect(201);
    expect(second.body.generated).toEqual([]);
    const rev = await http().get('/api/revenue?q=retainer').expect(200);
    expect(rev.body.total).toBe(3);
    expect(rev.body.items[0].recurringRuleId).toBe(rule.body.id);
  });

  // ─── Backup & restore ───────────────────────────────────────────────────────

  it('backup → restore preserves everything', async () => {
    const backupRes = await http().get('/api/export/backup.json').expect(200);
    const backup: BackupFile = JSON.parse(backupRes.text);
    expect(backup.version).toBe(1);
    expect(backup.expenses.length).toBeGreaterThan(0);
    expect(backup.expenses[0].splits.length).toBeGreaterThan(0);
    const balances: BalancesResponse = (await http().get('/api/stakeholders/balances').expect(200)).body;
    const analytics = (await http().get('/api/analytics/overview?from=2026-01-01&to=2026-12-31').expect(200)).body;

    const refused = await http().post('/api/import/backup').send(backup).expect(409);
    expect(refused.body.code).toBe('NOT_EMPTY');

    const restored = await http().post('/api/import/backup?replace=true').send(backup).expect(201);
    expect(restored.body.counts).toMatchObject({
      stakeholders: backup.stakeholders.length,
      categories: backup.categories.length,
      expenses: backup.expenses.length,
      revenue: backup.revenue.length,
      settlements: backup.settlements.length,
      recurring: backup.recurring.length,
      customFields: backup.customFields.length,
    });

    const backup2: BackupFile = JSON.parse((await http().get('/api/export/backup.json').expect(200)).text);
    const strip = (b: BackupFile) => ({ ...b, exportedAt: undefined });
    expect(strip(backup2)).toEqual(strip(backup));
    const balances2 = (await http().get('/api/stakeholders/balances').expect(200)).body;
    expect(balances2).toEqual(balances);
    const analytics2 = (await http().get('/api/analytics/overview?from=2026-01-01&to=2026-12-31').expect(200)).body;
    expect(analytics2).toEqual(analytics);
    await http().get(`/api/expenses/${backup.expenses[0].id}`).expect(200);

    const invalid = await http().post('/api/import/backup?replace=true').send({ hello: 'world' }).expect(400);
    expect(invalid.body.code).toBe('INVALID_BACKUP');
  });

  // ─── Audit ──────────────────────────────────────────────────────────────────

  it('audit log records the actions', async () => {
    const res = await http().get('/api/audit?pageSize=200').expect(200);
    const actions = new Set(res.body.items.map((a: { action: string }) => a.action));
    for (const a of ['create', 'update', 'delete', 'settle', 'import', 'generate', 'restore']) expect(actions).toContain(a);
    expect(res.body.items[0].actorEmail).toBe('local@ledgr');
  });
});
