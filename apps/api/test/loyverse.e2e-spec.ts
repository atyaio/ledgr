import 'reflect-metadata';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { LoyverseIntegration, LoyverseShiftPreview, PosItemsResponse, PullShiftResponse, Revenue } from '@ledgr/shared';
import { createApp } from '../src/bootstrap';
import { defaultConfig, resolvePaths, writeConfig } from '../src/common/config/ledgr-config';

/** A tiny Loyverse look-alike: fixed catalogue, one open + one closed shift, paginated receipts. */
function stubLoyverse() {
  const state = { currency: 'USD', dropBagel: false, failMerchantOnce: 0, requests: [] as string[] };
  const shiftClosed = {
    id: 'sh1',
    store_id: 'st1',
    pos_device_id: 'dev1',
    opened_at: '2026-06-01T06:00:00.000Z',
    closed_at: '2026-06-02T01:00:00.000Z', // closes after midnight: the row still belongs to June 1
    cash_payments: 20.5,
    cash_refunds: 4.5,
    paid_out: 3,
    cash_movements: [{ type: 'PAY_OUT', money_amount: 2, comment: 'Milk' }, { type: 'PAY_OUT', money_amount: 1, comment: '' }],
    gross_sales: 40,
    refunds: 4.5,
    net_sales: 36,
    payments: [
      { payment_type_id: 'pt-cash', money_amount: 20.5 },
      { payment_type_id: 'pt-talabat', money_amount: 4 },
      { payment_type_id: 'pt-visa', money_amount: 20 },
    ],
  };
  const shiftOpen = { id: 'sh-open', store_id: 'st1', pos_device_id: 'dev1', opened_at: '2026-06-02T06:00:00.000Z', closed_at: null };
  const receipts = [
    { receipt_number: '1-1', receipt_type: 'SALE', created_at: '2026-06-01T07:00:00.000Z', store_id: 'st1', pos_device_id: 'dev1', total_money: 12, payments: [{ payment_type_id: 'pt-cash', name: 'Cash', type: 'CASH', money_amount: 12 }], line_items: [{ item_id: 'i1', variant_id: 'v1', item_name: 'Latte', sku: 'L1', quantity: 2, price: 4.5, gross_total_money: 9, total_money: 9, cost: 1.2, cost_total: 2.4 }, { item_id: 'i2', variant_id: 'v2', item_name: 'Bagel', sku: 'B1', quantity: 1, price: 3, gross_total_money: 3, total_money: 3, cost: 1, cost_total: 1 }] },
    { receipt_number: '1-2', receipt_type: 'SALE', created_at: '2026-06-01T09:00:00.000Z', store_id: 'st1', pos_device_id: 'dev1', total_money: 28.5, payments: [{ payment_type_id: 'pt-cash', name: 'Cash', type: 'CASH', money_amount: 4.5 }, { payment_type_id: 'pt-talabat', name: 'Talabat cash', type: 'OTHER', money_amount: 4 }, { payment_type_id: 'pt-visa', name: 'Visa', type: 'NONINTEGRATEDCARD', money_amount: 20 }], line_items: [{ item_id: 'i1', variant_id: 'v1', item_name: 'Latte', sku: 'L1', quantity: 3, price: 4.5, gross_total_money: 13.5, total_money: 13.5, cost: 1.2, cost_total: 3.6 }, { item_id: 'i2', variant_id: 'v2', item_name: 'Bagel', sku: 'B1', quantity: 5, price: 3, gross_total_money: 15, total_money: 15, cost: 1, cost_total: 5 }] },
    { receipt_number: '1-3', receipt_type: 'REFUND', refund_for: '1-1', created_at: '2026-06-01T10:00:00.000Z', store_id: 'st1', pos_device_id: 'dev1', total_money: 4.5, payments: [{ payment_type_id: 'pt-cash', name: 'Cash', type: 'CASH', money_amount: 4.5 }], line_items: [{ item_id: 'i1', variant_id: 'v1', item_name: 'Latte', sku: 'L1', quantity: 1, price: 4.5, gross_total_money: 4.5, total_money: 4.5, cost: 1.2, cost_total: 1.2 }] },
    { receipt_number: '1-4', receipt_type: 'SALE', created_at: '2026-06-01T11:00:00.000Z', cancelled_at: '2026-06-01T11:05:00.000Z', store_id: 'st1', pos_device_id: 'dev1', total_money: 100, payments: [{ payment_type_id: 'pt-cash', name: 'Cash', type: 'CASH', money_amount: 100 }], line_items: [] },
    { receipt_number: '1-5', receipt_type: 'SALE', created_at: '2026-06-01T12:00:00.000Z', store_id: 'st1', pos_device_id: 'dev2', total_money: 50, payments: [{ payment_type_id: 'pt-cash', name: 'Cash', type: 'CASH', money_amount: 50 }], line_items: [] },
  ];
  const json = (res: http.ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub');
    state.requests.push(`${req.method} ${url.pathname}${url.search}`);
    if (req.headers.authorization !== 'Bearer good-token-1234567890') return json(res, 401, { errors: [{ code: 'UNAUTHORIZED', details: 'bad token' }] });
    const p = url.pathname.replace(/^\/v1\.0/, '');
    if (p === '/merchant/' || p === '/merchant') {
      if (state.failMerchantOnce > 0) {
        state.failMerchantOnce -= 1;
        return json(res, 429, { errors: [{ code: 'RATE_LIMITED' }] });
      }
      return json(res, 200, { id: 'm1', business_name: 'Stub Café', currency: { code: state.currency, decimal_places: 2 } });
    }
    if (p === '/stores') return json(res, 200, { stores: [{ id: 'st1', name: 'Main' }, { id: 'st2', name: 'Kiosk', deleted_at: '2026-01-01T00:00:00.000Z' }] });
    if (p === '/payment_types') return json(res, 200, { payment_types: [{ id: 'pt-cash', name: 'Cash', type: 'CASH' }, { id: 'pt-visa', name: 'Visa', type: 'NONINTEGRATEDCARD' }, { id: 'pt-talabat', name: 'Talabat cash', type: 'OTHER' }] });
    if (p === '/categories') return json(res, 200, { categories: [{ id: 'c1', name: 'Drinks', color: 'BLUE' }, { id: 'c2', name: 'Food', color: 'RED' }] });
    if (p === '/items') {
      const items = [{ id: 'i1', item_name: 'Latte', category_id: 'c1', variants: [{ variant_id: 'v1', sku: 'L1', default_price: 4.5, cost: 1.2 }] }, { id: 'i2', item_name: 'Bagel', category_id: 'c2', variants: [{ variant_id: 'v2', sku: 'B1', default_price: 3, cost: 1 }] }];
      return json(res, 200, { items: state.dropBagel ? items.slice(0, 1) : items });
    }
    if (p === '/shifts') return json(res, 200, { shifts: [shiftOpen, shiftClosed] });
    if (p === '/shifts/sh1') return json(res, 200, shiftClosed);
    if (p === '/shifts/sh-open') return json(res, 200, shiftOpen);
    if (p === '/receipts') {
      if (url.searchParams.get('store_id') !== 'st1' || !url.searchParams.get('created_at_min') || !url.searchParams.get('created_at_max')) return json(res, 400, { errors: [{ code: 'MISSING_REQUIRED_PARAMETER' }] });
      const cursor = url.searchParams.get('cursor');
      if (!cursor) return json(res, 200, { receipts: receipts.slice(0, 2), cursor: 'page-2' });
      return json(res, 200, { receipts: receipts.slice(2) });
    }
    return json(res, 404, { errors: [{ code: 'NOT_FOUND' }] });
  });
  return { server, state };
}

describe('Loyverse integration (e2e)', () => {
  let app: NestExpressApplication;
  let dir: string;
  const stub = stubLoyverse();
  const http = () => request(app.getHttpServer());
  const TOKEN = 'good-token-1234567890';

  beforeAll(async () => {
    await new Promise<void>((r) => stub.server.listen(0, '127.0.0.1', r));
    process.env.LEDGR_LOYVERSE_API_BASE = `http://127.0.0.1:${(stub.server.address() as AddressInfo).port}/v1.0`;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgr-lv-'));
    const ledgrDir = path.join(dir, '.ledgr');
    writeConfig(resolvePaths(ledgrDir), defaultConfig({ name: 'LV', slug: 'lv', currency: 'USD', weekStartsOn: 1, timezone: 'UTC', auth: { mode: 'none' } }));
    const created = await createApp({ dir: ledgrDir, webDist: null, logger: false });
    app = created.app;
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await new Promise<void>((r) => stub.server.close(() => r()));
    delete process.env.LEDGR_LOYVERSE_API_BASE;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('starts disconnected and refuses to work without a token', async () => {
    const res = await http().get('/api/integrations').expect(200);
    expect(res.body.items).toEqual([{ provider: 'loyverse', connected: false }]);
    expect((await http().post('/api/integrations/loyverse/sync-items').expect(400)).body.code).toBe('NOT_CONNECTED');
  });

  it('connect verifies the token, the currency, and defaults to pulling cash', async () => {
    expect((await http().post('/api/integrations/loyverse/connect').send({ accessToken: 'wrong-token-1234567890' }).expect(400)).body.code).toBe('LOYVERSE_UNAUTHORIZED');
    stub.state.currency = 'EUR';
    expect((await http().post('/api/integrations/loyverse/connect').send({ accessToken: TOKEN }).expect(400)).body.code).toBe('CURRENCY_MISMATCH');
    stub.state.currency = 'USD';
    stub.state.failMerchantOnce = 1; // one 429, then fine: the client retries
    const res = await http().post('/api/integrations/loyverse/connect').send({ accessToken: TOKEN }).expect(201);
    const i: LoyverseIntegration = res.body;
    expect(i.connected).toBe(true);
    expect(i.merchantName).toBe('Stub Café');
    expect(i.currency).toBe('USD');
    expect(i.stores).toEqual([{ id: 'st1', name: 'Main' }]);
    expect(i.paymentTypes.map((p) => p.name)).toEqual(['Cash', 'Visa', 'Talabat cash']);
    // cash-like by kind or by name
    expect(i.settings.paymentTypeIds).toEqual(['pt-cash', 'pt-talabat']);
    const status = await http().get('/api/integrations/loyverse').expect(200);
    expect(status.body).not.toHaveProperty('accessToken');
  });

  it('settings validate stores, payment types and the revenue category', async () => {
    expect((await http().put('/api/integrations/loyverse/settings').send({ storeIds: ['nope'] }).expect(400)).body.code).toBe('UNKNOWN_STORE');
    expect((await http().put('/api/integrations/loyverse/settings').send({ paymentTypeIds: ['nope'] }).expect(400)).body.code).toBe('UNKNOWN_PAYMENT_TYPE');
    const expenseCat = (await http().post('/api/categories').send({ name: 'Rent', kind: 'expense' }).expect(201)).body;
    await http().put('/api/integrations/loyverse/settings').send({ categoryId: expenseCat.id }).expect(400);
    const pos = (await http().post('/api/categories').send({ name: 'POS sales', kind: 'revenue' }).expect(201)).body;
    const res = await http().put('/api/integrations/loyverse/settings').send({ storeIds: ['st1'], categoryId: pos.id }).expect(200);
    expect(res.body.settings).toMatchObject({ storeIds: ['st1'], categoryId: pos.id, paymentTypeIds: ['pt-cash', 'pt-talabat'] });
  });

  it('syncs the catalogue with categories, prices and costs in minor units', async () => {
    const res = await http().post('/api/integrations/loyverse/sync-items').expect(201);
    expect(res.body).toMatchObject({ categories: 2, items: 2, removed: 0 });
    const list: PosItemsResponse = (await http().get('/api/integrations/loyverse/items').expect(200)).body;
    expect(list.total).toBe(2);
    const latte = list.items.find((i) => i.name === 'Latte')!;
    expect(latte).toMatchObject({ sku: 'L1', priceMinor: 450, costMinor: 120, category: expect.objectContaining({ name: 'Drinks' }) });
    expect(list.categories.map((c) => [c.name, c.itemCount])).toEqual([['Drinks', 1], ['Food', 1]]);
    const drinks = (await http().get(`/api/integrations/loyverse/items?q=lat`).expect(200)).body as PosItemsResponse;
    expect(drinks.items.map((i) => i.name)).toEqual(['Latte']);
  });

  it('lists only closed shifts with the provider totals', async () => {
    const shifts: LoyverseShiftPreview[] = (await http().get('/api/integrations/loyverse/shifts?limit=5').expect(200)).body;
    expect(shifts).toHaveLength(1);
    expect(shifts[0]).toMatchObject({ externalId: 'sh1', storeName: 'Main', cashMinor: 1600, paidOutMinor: 300, netSalesMinor: 3600, pulled: null });
    expect(shifts[0].payments).toEqual([
      { paymentTypeId: 'pt-cash', name: 'Cash', type: 'CASH', amountMinor: 2050, selected: true },
      { paymentTypeId: 'pt-talabat', name: 'Talabat cash', type: 'OTHER', amountMinor: 400, selected: true },
      { paymentTypeId: 'pt-visa', name: 'Visa', type: 'NONINTEGRATEDCARD', amountMinor: 2000, selected: false },
    ]);
  });

  let revenueId = '';

  it('pulls the last closed shift as one cash revenue row with sales by item', async () => {
    // The ledger already has a Cash method (with an Arabic name); cash-like types must land on it, not create another.
    await http().post('/api/payment-methods').send({ name: 'Cash', nameAr: 'نقداً', isDefault: true }).expect(201);
    const res = await http().post('/api/integrations/loyverse/pull-shift').send({}).expect(201);
    const r: PullShiftResponse = res.body;
    expect(r.created).toBe(true);
    // cash 12 + 4.5 − 4.5 refund − 3 paid out, plus Talabat cash 4 folded in; the cancelled receipt and the other POS device are ignored
    expect(r.revenue.amountMinor).toBe(1300);
    expect(r.revenue.payments).toEqual([expect.objectContaining({ name: 'Cash', amountMinor: 1300 })]);
    expect(r.sales.totals).toMatchObject({ paidOutMinor: 300, payoutsSubtracted: true });
    expect(r.sales.payouts).toEqual([{ amountMinor: 200, comment: 'Milk', at: null }, { amountMinor: 100, comment: null, at: null }]);
    expect(r.revenue.date).toBe('2026-06-01');
    expect(r.revenue.description).toBe('Shift · Main · 06:00–01:00');
    expect(r.revenue.source).toBe('Loyverse');
    expect(r.revenue.category?.name).toBe('POS sales');
    expect(r.revenue.pos).toMatchObject({ provider: 'loyverse', externalId: 'sh1', storeName: 'Main', receipts: 3 });
    expect(r.shift.shiftId).toBe(r.revenue.pos?.shiftId);
    expect(r.sales.totals).toMatchObject({ receipts: 2, refunds: 1, netMinor: 3600, costMinor: 1080 });
    const latte = r.sales.lines.find((l) => l.itemName === 'Latte')!;
    expect(latte).toMatchObject({ quantity: 4, netMinor: 1800, costMinor: 480, categoryName: 'Drinks', sku: 'L1' });
    expect(r.sales.lines.find((l) => l.itemName === 'Bagel')).toMatchObject({ quantity: 6, netMinor: 1800, categoryName: 'Food' });
    expect(r.sales.payments).toEqual(expect.arrayContaining([expect.objectContaining({ paymentTypeId: 'pt-visa', amountMinor: 2000, pulled: false }), expect.objectContaining({ paymentTypeId: 'pt-cash', amountMinor: 1200, pulled: true }), expect.objectContaining({ paymentTypeId: 'pt-talabat', amountMinor: 400, pulled: true })]));
    expect(r.sales.byCategory.map((c) => c.name).sort()).toEqual(['Drinks', 'Food']);
    revenueId = r.revenue.id;

    // Both cash-like types folded into the existing Cash method; nothing else was created.
    const methods = (await http().get('/api/payment-methods').expect(200)).body as { name: string; isDefault: boolean }[];
    expect(methods).toEqual([expect.objectContaining({ name: 'Cash', isDefault: true })]);

    const shifts: LoyverseShiftPreview[] = (await http().get('/api/integrations/loyverse/shifts').expect(200)).body;
    expect(shifts[0].pulled).toMatchObject({ revenueId });
    const sales = await http().get(`/api/integrations/loyverse/shifts/${r.shift.shiftId}/sales`).expect(200);
    expect(sales.body.lines).toHaveLength(2);
  });

  it('pulling the same shift again updates the row instead of duplicating it', async () => {
    const before = (await http().get('/api/revenue').expect(200)).body.total;
    const res = await http().post('/api/integrations/loyverse/pull-shift').send({ shiftId: 'sh1' }).expect(201);
    expect(res.body.created).toBe(false);
    expect(res.body.revenue.id).toBe(revenueId);
    expect((await http().get('/api/revenue').expect(200)).body.total).toBe(before);
    expect((await http().post('/api/integrations/loyverse/pull-shift').send({ shiftId: 'sh-open' }).expect(400)).body.code).toBe('SHIFT_OPEN');
  });

  it('insights carry sales by item and category for the pulled shifts', async () => {
    const res = await http().get('/api/analytics/insights?from=2026-06-01&to=2026-06-30&ledger=revenue').expect(200);
    expect(res.body.posSales).toMatchObject({ shifts: 1, quantity: 10, netMinor: 3600, costMinor: 1080 });
    expect(res.body.posSales.byItem.map((i: { itemName: string }) => i.itemName).sort()).toEqual(['Bagel', 'Latte']);
    expect(res.body.posSales.byCategory.map((c: { name: string; pct: number }) => [c.name, Math.round(c.pct)]).sort()).toEqual([['Drinks', 50], ['Food', 50]]);
    const none = await http().get('/api/analytics/insights?from=2026-07-01&to=2026-07-31').expect(200);
    expect(none.body.posSales).toBeNull();
  });

  it('enabling Visa in the settings pulls it on the next pull', async () => {
    await http().put('/api/integrations/loyverse/settings').send({ paymentTypeIds: ['pt-cash', 'pt-visa'] }).expect(200);
    const res = await http().post('/api/integrations/loyverse/pull-shift').send({}).expect(201);
    const r: Revenue = res.body.revenue;
    expect(r.id).toBe(revenueId);
    expect(r.amountMinor).toBe(2900);
    expect(r.payments.map((p) => [p.name, p.amountMinor])).toEqual([['Cash', 900], ['Visa', 2000]]);
    await http().put('/api/integrations/loyverse/settings').send({ paymentTypeIds: ['pt-cash', 'pt-talabat'] }).expect(200);
  });

  it('pay-outs can be left on the cash amount', async () => {
    await http().put('/api/integrations/loyverse/settings').send({ subtractPayouts: false }).expect(200);
    const res = await http().post('/api/integrations/loyverse/pull-shift').send({}).expect(201);
    expect(res.body.revenue.amountMinor).toBe(1600);
    expect(res.body.sales.totals.payoutsSubtracted).toBe(false);
    await http().put('/api/integrations/loyverse/settings').send({ subtractPayouts: true }).expect(200);
  });

  it('deleting the revenue row frees the shift to be pulled again', async () => {
    await http().delete(`/api/revenue/${revenueId}`).expect(204);
    const shifts: LoyverseShiftPreview[] = (await http().get('/api/integrations/loyverse/shifts').expect(200)).body;
    expect(shifts[0].pulled?.revenueId).toBeNull();
    const res = await http().post('/api/integrations/loyverse/pull-shift').send({}).expect(201);
    expect(res.body.created).toBe(true);
    expect(res.body.revenue.amountMinor).toBe(1300);
    revenueId = res.body.revenue.id;
  });

  it('a later item sync marks removed items as deleted', async () => {
    stub.state.dropBagel = true;
    const res = await http().post('/api/integrations/loyverse/sync-items').expect(201);
    expect(res.body).toMatchObject({ items: 1, removed: 1 });
    expect((await http().get('/api/integrations/loyverse/items').expect(200)).body.total).toBe(1);
    expect((await http().get('/api/integrations/loyverse/items?includeDeleted=true').expect(200)).body.total).toBe(2);
  });

  it('disconnect forgets the token and catalogue but keeps the ledger rows', async () => {
    await http().delete('/api/integrations/loyverse').expect(204);
    expect((await http().get('/api/integrations/loyverse').expect(200)).body).toEqual({ provider: 'loyverse', connected: false });
    expect((await http().get('/api/integrations/loyverse/items').expect(400)).body.code).toBe('NOT_CONNECTED');
    const r = await http().get(`/api/revenue/${revenueId}`).expect(200);
    expect(r.body.amountMinor).toBe(1300);
    expect(r.body.pos).toBeNull();
    const audit = (await http().get('/api/audit?entity=posShift').expect(200)).body;
    expect(audit.items.length).toBeGreaterThan(0);
  });
});
