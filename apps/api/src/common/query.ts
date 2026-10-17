import { z } from 'zod';

/** Query-string boolean: only "true" / "1" / "yes" count as true (z.coerce.boolean treats "false" as true). */
export const boolQuery = z
  .string()
  .optional()
  .transform((v) => v !== undefined && ['true', '1', 'yes'].includes(v.toLowerCase()));

export const forceQuery = z.object({ force: boolQuery });
export type ForceQuery = z.infer<typeof forceQuery>;

export const replaceQuery = z.object({ replace: boolQuery });
export type ReplaceQuery = z.infer<typeof replaceQuery>;

export function pct(part: number, whole: number, digits = 2): number {
  if (whole === 0) return 0;
  const f = 10 ** digits;
  return Math.round((part / whole) * 100 * f) / f;
}

export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100 * 100) / 100;
}
