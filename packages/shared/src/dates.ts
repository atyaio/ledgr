import type { Granularity } from './types';

export type RangePreset = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'last7' | 'last30' | 'last90' | 'last12m' | 'all' | 'custom';

export const RANGE_PRESETS: { id: RangePreset; label: string; short: string }[] = [
  { id: 'today', label: 'Today', short: 'D' },
  { id: 'week', label: 'This week', short: 'W' },
  { id: 'month', label: 'This month', short: 'M' },
  { id: 'quarter', label: 'This quarter', short: 'Q' },
  { id: 'year', label: 'This year', short: 'Y' },
  { id: 'last30', label: 'Last 30 days', short: '30d' },
  { id: 'last12m', label: 'Last 12 months', short: '12m' },
  { id: 'custom', label: 'Custom', short: '…' },
];

export interface DateRange {
  from: string;
  to: string;
}

/** Format a Date as YYYY-MM-DD using UTC fields (all ledgr dates are calendar dates). */
export function toISODate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function todayISO(now: Date = new Date()): string {
  // Use the local calendar day, then re-express as UTC date-only.
  return toISODate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISODate(d);
}

export function addMonths(iso: string, n: number): string {
  const d = parseISODate(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = daysInMonth(d.getUTCFullYear(), d.getUTCMonth());
  d.setUTCDate(Math.min(day, last));
  return toISODate(d);
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / 86_400_000);
}

export function startOfWeek(iso: string, weekStartsOn: number): string {
  const d = parseISODate(iso);
  const diff = (d.getUTCDay() - weekStartsOn + 7) % 7;
  return addDays(iso, -diff);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string): string {
  const d = parseISODate(iso);
  return toISODate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

export function startOfQuarter(iso: string): string {
  const d = parseISODate(iso);
  const q = Math.floor(d.getUTCMonth() / 3) * 3;
  return toISODate(new Date(Date.UTC(d.getUTCFullYear(), q, 1)));
}

export function startOfYear(iso: string, fiscalYearStartMonth = 1): string {
  const d = parseISODate(iso);
  const m0 = fiscalYearStartMonth - 1;
  const year = d.getUTCMonth() >= m0 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return toISODate(new Date(Date.UTC(year, m0, 1)));
}

export interface CalendarOptions {
  weekStartsOn?: number;
  fiscalYearStartMonth?: number;
  today?: string;
}

export function rangeForPreset(preset: RangePreset, opts: CalendarOptions = {}): DateRange {
  const today = opts.today ?? todayISO();
  const ws = opts.weekStartsOn ?? 1;
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'week': {
      const from = startOfWeek(today, ws);
      return { from, to: addDays(from, 6) };
    }
    case 'month':
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case 'quarter': {
      const from = startOfQuarter(today);
      return { from, to: addDays(addMonths(from, 3), -1) };
    }
    case 'year': {
      const from = startOfYear(today, opts.fiscalYearStartMonth ?? 1);
      return { from, to: addDays(addMonths(from, 12), -1) };
    }
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'last90':
      return { from: addDays(today, -89), to: today };
    case 'last12m':
      return { from: addDays(addMonths(today, -12), 1), to: today };
    case 'all':
      return { from: '1970-01-01', to: '2999-12-31' };
    case 'custom':
    default:
      return { from: startOfMonth(today), to: endOfMonth(today) };
  }
}

/** Shift a range by one period of its own length ("previous"/"next"). Calendar-aware for whole months. */
export function shiftRange(range: DateRange, direction: -1 | 1): DateRange {
  if (range.from === startOfMonth(range.from) && range.to === endOfMonth(range.to)) {
    const months = monthsBetween(range.from, range.to) + 1;
    const from = addMonths(range.from, direction * months);
    return { from, to: endOfMonth(addMonths(from, months - 1)) };
  }
  const len = daysBetween(range.from, range.to) + 1;
  return { from: addDays(range.from, direction * len), to: addDays(range.to, direction * len) };
}

export function previousRange(range: DateRange): DateRange {
  return shiftRange(range, -1);
}

export function monthsBetween(from: string, to: string): number {
  const a = parseISODate(from);
  const b = parseISODate(to);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

export function autoGranularity(range: DateRange): Granularity {
  const days = daysBetween(range.from, range.to) + 1;
  if (days <= 31) return 'day';
  if (days <= 26 * 7) return 'week';
  return 'month';
}

/** Bucket key for a date under a granularity. */
export function bucketOf(iso: string, g: Granularity, weekStartsOn = 1): string {
  if (g === 'day') return iso;
  if (g === 'week') return startOfWeek(iso, weekStartsOn);
  return startOfMonth(iso);
}

/** All bucket keys covering the range, in order (so charts have no gaps). */
export function bucketsFor(range: DateRange, g: Granularity, weekStartsOn = 1): string[] {
  const out: string[] = [];
  let cur = bucketOf(range.from, g, weekStartsOn);
  const end = bucketOf(range.to, g, weekStartsOn);
  let guard = 0;
  while (cur <= end && guard++ < 5000) {
    out.push(cur);
    cur = g === 'day' ? addDays(cur, 1) : g === 'week' ? addDays(cur, 7) : addMonths(cur, 1);
  }
  return out;
}

export function detectPreset(range: DateRange, opts: CalendarOptions = {}): RangePreset {
  for (const p of ['today', 'week', 'month', 'quarter', 'year', 'last30', 'last12m'] as RangePreset[]) {
    const r = rangeForPreset(p, opts);
    if (r.from === range.from && r.to === range.to) return p;
  }
  return 'custom';
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** Next occurrence for recurring rules. */
export function nextOccurrence(iso: string, frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly', interval: number): string {
  switch (frequency) {
    case 'daily':
      return addDays(iso, interval);
    case 'weekly':
      return addDays(iso, 7 * interval);
    case 'monthly':
      return addMonths(iso, interval);
    case 'quarterly':
      return addMonths(iso, 3 * interval);
    case 'yearly':
      return addMonths(iso, 12 * interval);
  }
}
