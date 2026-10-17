/** Number of minor units per major unit for a currency (ISO 4217 exceptions). */
export function minorUnitDigits(currency: string): number {
  const zero = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'HUF', 'UGX', 'XOF', 'XAF', 'PYG', 'RWF']);
  const three = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);
  const c = currency.toUpperCase();
  if (zero.has(c)) return 0;
  if (three.has(c)) return 3;
  return 2;
}

export function minorToMajor(minor: number, currency: string): number {
  return minor / 10 ** minorUnitDigits(currency);
}

export function majorToMinor(major: number, currency: string): number {
  return Math.round(major * 10 ** minorUnitDigits(currency));
}

export interface FormatMoneyOptions {
  locale?: string;
  /** 'symbol' (default) | 'code' | 'none' */
  display?: 'symbol' | 'code' | 'none';
  /** Show "+" for positive numbers. */
  signed?: boolean;
  /** Collapse to 1.2K / 3.4M. */
  compact?: boolean;
  /** Hide decimals when the amount is a whole unit. */
  trimZeros?: boolean;
}

export function formatMoney(minor: number, currency: string, opts: FormatMoneyOptions = {}): string {
  const digits = minorUnitDigits(currency);
  const major = minor / 10 ** digits;
  const locale = opts.locale ?? 'en-US';
  const display = opts.display ?? 'symbol';
  const whole = Number.isInteger(major);
  const fraction = opts.trimZeros && whole ? 0 : digits;
  const base: Intl.NumberFormatOptions = {
    minimumFractionDigits: opts.compact ? 0 : fraction,
    maximumFractionDigits: opts.compact ? 1 : fraction,
    notation: opts.compact ? 'compact' : 'standard',
    signDisplay: opts.signed ? 'exceptZero' : 'auto',
  };
  const f = new Intl.NumberFormat(locale, display === 'none' ? base : { ...base, style: 'currency', currency, currencyDisplay: display === 'code' ? 'code' : 'narrowSymbol' });
  return f.format(major);
}

/**
 * Parse a human-entered money string into minor units.
 * Accepts "1,234.50", "1234.5", "EGP 1,234.50", "$1,234", "(120.00)" (negative), "-12", "1.234,50" (EU).
 * Returns null when it cannot parse.
 */
export function parseMoney(input: string | number | null | undefined, currency: string): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? majorToMinor(input, currency) : null;
  let s = input.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^\d.,\-+]/g, '');
  if (!s) return null;
  if (s.startsWith('-')) negative = !negative;
  s = s.replace(/[+-]/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized: string;
  if (lastComma > -1 && lastDot > -1) {
    // Whichever separator comes last is the decimal separator.
    normalized = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    // Single comma: decimal if followed by 1–2 digits at end, else thousands.
    const after = s.length - lastComma - 1;
    const commas = (s.match(/,/g) ?? []).length;
    normalized = commas === 1 && (after === 1 || after === 2) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else {
    const dots = (s.match(/\./g) ?? []).length;
    normalized = dots > 1 ? s.replace(/\./g, '') : s;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return majorToMinor(negative ? -n : n, currency);
}

/** Format minor units as a plain decimal string for CSV, e.g. 123450 → "1234.50". */
export function minorToDecimalString(minor: number, currency: string): string {
  const digits = minorUnitDigits(currency);
  return (minor / 10 ** digits).toFixed(digits);
}

export function formatPercent(value: number, fractionDigits = 1, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: fractionDigits }).format(value / 100);
}
