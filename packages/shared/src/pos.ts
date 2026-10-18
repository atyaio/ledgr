/** Helpers shared by the API and the UI for POS integrations. */

const CASH_WORDS = /cash|كاش|نقد/i;

/**
 * A payment type that is physically cash: Loyverse's CASH kind, or any custom type whose
 * name says cash in English or Arabic ("Talabat cash", "طلبات كاش"). These are pulled
 * by default and all land on the ledger's single Cash method.
 */
export function isCashLikePaymentType(p: { type: string; name: string }): boolean {
  return p.type === 'CASH' || CASH_WORDS.test(p.name);
}

/** Whether a ledgr payment method is the cash one, by either of its names. */
export function isCashMethodName(name: string | null | undefined): boolean {
  return !!name && CASH_WORDS.test(name);
}
