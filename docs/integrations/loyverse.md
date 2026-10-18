# Loyverse integration

Built scope (decided 2026-10-18): the item catalogue with its categories, and a **Pull last shift** button on the Revenue page so the day's takings are not typed in by hand. Cash only by default.

## Loyverse API facts used

Source: the OpenAPI spec behind https://developer.loyverse.com/docs/ (`API-Reference__v1.0.yaml`).

- Base URL `https://api.loyverse.com/v1.0`, `Authorization: Bearer <personal access token>` (Back Office → Integrations → Access tokens, up to 20 per account, full read access). OAuth exists but is only needed for a hosted multi-tenant app.
- 300 requests per 300 s per account; `429` when exceeded (the client retries with backoff). Cursor pagination, `limit` max 250.
- `GET /merchant/` → business name and `currency { code, decimal_places }`; the connect step refuses a currency that differs from the project's.
- `GET /stores`, `GET /payment_types` (`type` ∈ CASH, NONINTEGRATEDCARD, CHECK, OTHER, gateways), `GET /categories`, `GET /items` (variants with `sku`, `default_price`, `cost`).
- `GET /shifts` newest first with `opened_at / closed_at`, `cash_payments`, `cash_refunds`, `gross_sales`, `net_sales`, `payments[]` per payment type.
- `GET /receipts?store_id&created_at_min&created_at_max` → `receipt_type SALE|REFUND`, `cancelled_at`, `pos_device_id`, `payments[] { payment_type_id, money_amount }`, `line_items[] { item_id, variant_id, item_name, quantity, gross_total_money, total_money, cost_total }`. Money is a decimal number; dates are UTC.
- Refund receipts carry a **positive** total, so they are subtracted. Cancelled receipts are skipped.
- Webhooks exist (`receipts.update`, `shifts.create`) but personal-token webhooks are unsigned and need a public HTTPS URL, so the integration pulls on demand instead.

## How ledgr uses it

- **Connect** (`POST /api/integrations/loyverse/connect`): verifies the token, stores it in `data.db` (gitignored; never in `config.json`), caches stores and payment types, and selects the cash-like payment types by default (kind `CASH`, or a name containing cash / كاش / نقد such as "Talabat cash").
- **Sync items**: upserts `PosCategory` / `PosItem` (price and cost in minor units using the merchant's decimal places); items that disappear upstream are soft-deleted.
- **Pull shift**: fetches the shift's receipts (same store and POS device, inside the open–close window), sums `SALE − REFUND` per payment type and per item variant, and writes one `Revenue` row with an amount per selected payment type (Loyverse payment type → ledgr payment method via `methodMap`; cash-like types all fold into the single Cash method, others are matched or created by name). Cash pay-outs (`paid_out` / PAY_OUT cash movements) are subtracted from the drawer's cash amount unless `subtractPayouts` is off; they are listed with the cashier's note on the shift summary. Date is the local day the shift closed (`config.timezone`). Re-pulling updates the same row; deleting the row lets the shift be pulled again.
- **Sales by item** are kept per shift (`PosSale`) and shown on the revenue row and, aggregated, as "Best sellers" and "Sales by category" on Insights.

## Testing

`apps/api/test/loyverse.e2e-spec.ts` runs the API against an in-process stub of the Loyverse API; `LEDGR_LOYVERSE_API_BASE` points the client at it. The same env var can point a running ledgr at any stub for demos.
