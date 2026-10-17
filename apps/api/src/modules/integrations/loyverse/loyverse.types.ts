/** Loyverse API v1.0 objects, only the fields ledgr reads. Money is a decimal number; dates are UTC ISO strings. */

export interface LvMerchant {
  id: string;
  business_name: string;
  email?: string;
  country?: string;
  currency?: { code?: string; decimal_places?: number };
}

export interface LvStore {
  id: string;
  name: string;
  deleted_at?: string | null;
}

export interface LvPaymentType {
  id: string;
  name: string;
  type: string;
  stores?: string[];
  deleted_at?: string | null;
}

export interface LvCategory {
  id: string;
  name: string;
  color?: string;
  deleted_at?: string | null;
  updated_at?: string;
}

export interface LvVariant {
  variant_id: string;
  sku?: string;
  option1_value?: string | null;
  option2_value?: string | null;
  option3_value?: string | null;
  default_price?: number | null;
  cost?: number | null;
  deleted_at?: string | null;
}

export interface LvItem {
  id: string;
  item_name: string;
  category_id?: string | null;
  track_stock?: boolean;
  variants?: LvVariant[];
  deleted_at?: string | null;
  updated_at?: string;
}

export interface LvShift {
  id: string;
  store_id: string;
  pos_device_id?: string;
  opened_at: string;
  closed_at?: string | null;
  starting_cash?: number;
  cash_payments?: number;
  cash_refunds?: number;
  paid_in?: number;
  paid_out?: number;
  expected_cash?: number;
  actual_cash?: number;
  gross_sales?: number;
  refunds?: number;
  discounts?: number;
  net_sales?: number;
  payments?: { payment_type_id: string; money_amount: number }[];
}

export interface LvLineItem {
  id?: string;
  item_id?: string | null;
  variant_id?: string | null;
  item_name: string;
  variant_name?: string | null;
  sku?: string | null;
  quantity: number;
  price?: number;
  gross_total_money?: number;
  total_money?: number;
  cost?: number;
  cost_total?: number;
}

export interface LvPayment {
  payment_type_id: string;
  name?: string;
  type?: string;
  money_amount: number;
  paid_at?: string;
}

export interface LvReceipt {
  receipt_number: string;
  receipt_type: 'SALE' | 'REFUND';
  refund_for?: string | null;
  created_at: string;
  receipt_date?: string;
  updated_at?: string;
  cancelled_at?: string | null;
  store_id: string;
  pos_device_id?: string;
  total_money?: number;
  total_tax?: number;
  total_discount?: number;
  tip?: number;
  surcharge?: number;
  line_items?: LvLineItem[];
  payments?: LvPayment[];
}

/** Loyverse money (decimal) → integer minor units using the merchant's decimal places. */
export function toMinor(amount: number | null | undefined, decimals: number): number {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return 0;
  return Math.round(amount * 10 ** decimals);
}

/** Variant display name from its option values ("XL / Red"). */
export function variantName(v: LvVariant): string | null {
  const parts = [v.option1_value, v.option2_value, v.option3_value].filter((x): x is string => !!x && x.trim().length > 0);
  return parts.length ? parts.join(' / ') : null;
}
