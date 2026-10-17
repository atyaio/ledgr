export interface ShareInput {
  stakeholderId: string;
  sharePercent: number;
}
export interface SplitResult {
  stakeholderId: string;
  sharePercent: number;
  amountMinor: number;
}

/**
 * Divide `amountMinor` across shares using the largest-remainder method so the
 * parts always sum exactly to the total. Shares are normalised by their sum, so
 * [60, 20] behaves like [75, 25]. Zero/negative shares get 0.
 */
export function splitAmount(amountMinor: number, shares: ShareInput[]): SplitResult[] {
  const valid = shares.filter((s) => s.sharePercent > 0);
  const total = valid.reduce((a, s) => a + s.sharePercent, 0);
  if (valid.length === 0 || total <= 0) return [];
  const sign = amountMinor < 0 ? -1 : 1;
  const abs = Math.abs(amountMinor);
  const raw = valid.map((s) => (abs * s.sharePercent) / total);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = abs - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  return valid.map((s, i) => ({
    stakeholderId: s.stakeholderId,
    sharePercent: round4((s.sharePercent / total) * 100),
    amountMinor: sign * floors[i],
  }));
}

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function shareTotal(shares: { sharePercent: number; active?: boolean }[]): number {
  return round4(shares.filter((s) => s.active !== false).reduce((a, s) => a + s.sharePercent, 0));
}

/** True when custom percentages add up to 100 within tolerance. */
export function validCustomSplit(splits: ShareInput[], tolerance = 0.01): boolean {
  if (splits.length === 0) return false;
  const seen = new Set<string>();
  for (const s of splits) {
    if (seen.has(s.stakeholderId)) return false;
    seen.add(s.stakeholderId);
  }
  return Math.abs(shareTotal(splits) - 100) <= tolerance;
}
