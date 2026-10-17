import { POOL_ID } from './types';
import type { SuggestedTransfer } from './types';

export interface PartyBalance {
  id: string;
  name: string;
  nameAr?: string | null;
  netMinor: number; // >0 is owed money, <0 owes money
}

/**
 * Greedy debt simplification: match the largest debtor with the largest creditor
 * until everything is settled. Produces at most n−1 transfers. The pool (if
 * present) participates like any party; residual rounding goes to the pool.
 */
export function suggestTransfers(balances: PartyBalance[]): SuggestedTransfer[] {
  const creditors = balances.filter((b) => b.netMinor > 0).map((b) => ({ ...b })).sort((a, b) => b.netMinor - a.netMinor);
  const debtors = balances.filter((b) => b.netMinor < 0).map((b) => ({ ...b, netMinor: -b.netMinor })).sort((a, b) => b.netMinor - a.netMinor);
  const out: SuggestedTransfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const amt = Math.min(d.netMinor, c.netMinor);
    if (amt > 0) {
      out.push({ fromStakeholderId: d.id, fromName: d.name, fromNameAr: d.nameAr ?? null, toStakeholderId: c.id, toName: c.name, toNameAr: c.nameAr ?? null, amountMinor: amt });
    }
    d.netMinor -= amt;
    c.netMinor -= amt;
    if (d.netMinor === 0) i++;
    if (c.netMinor === 0) j++;
  }
  return out;
}

export function isPool(id: string | null | undefined): boolean {
  return id === null || id === undefined || id === POOL_ID;
}
