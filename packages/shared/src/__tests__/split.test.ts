import { describe, expect, it } from 'vitest';
import { splitAmount, validCustomSplit } from '../split';
import { suggestTransfers } from '../balances';
import { parseMoney, formatMoney, minorToDecimalString } from '../money';
import { rangeForPreset, bucketsFor, autoGranularity, previousRange, nextOccurrence, addMonths } from '../dates';
import { parseDateCell, suggestMapping, importTargets, detectDateFormat, toCSV } from '../csv';

describe('splitAmount', () => {
  it('sums exactly to the total with largest remainder', () => {
    const r = splitAmount(10000, [
      { stakeholderId: 'a', sharePercent: 33.333 },
      { stakeholderId: 'b', sharePercent: 33.333 },
      { stakeholderId: 'c', sharePercent: 33.334 },
    ]);
    expect(r.reduce((s, x) => s + x.amountMinor, 0)).toBe(10000);
    expect(r.map((x) => x.amountMinor).sort()).toEqual([3333, 3333, 3334].sort());
  });
  it('normalises shares that do not total 100', () => {
    const r = splitAmount(1000, [{ stakeholderId: 'a', sharePercent: 60 }, { stakeholderId: 'b', sharePercent: 20 }]);
    expect(r).toEqual([
      { stakeholderId: 'a', sharePercent: 75, amountMinor: 750 },
      { stakeholderId: 'b', sharePercent: 25, amountMinor: 250 },
    ]);
  });
  it('handles odd cents', () => {
    const r = splitAmount(1, [{ stakeholderId: 'a', sharePercent: 50 }, { stakeholderId: 'b', sharePercent: 50 }]);
    expect(r.reduce((s, x) => s + x.amountMinor, 0)).toBe(1);
  });
  it('validates custom splits', () => {
    expect(validCustomSplit([{ stakeholderId: 'a', sharePercent: 50 }, { stakeholderId: 'b', sharePercent: 50 }])).toBe(true);
    expect(validCustomSplit([{ stakeholderId: 'a', sharePercent: 50 }, { stakeholderId: 'a', sharePercent: 50 }])).toBe(false);
    expect(validCustomSplit([{ stakeholderId: 'a', sharePercent: 70 }])).toBe(false);
  });
});

describe('suggestTransfers', () => {
  it('settles with minimal greedy transfers', () => {
    const t = suggestTransfers([
      { id: 'a', name: 'A', netMinor: 500 },
      { id: 'b', name: 'B', netMinor: -300 },
      { id: 'c', name: 'C', netMinor: -200 },
    ]);
    expect(t).toHaveLength(2);
    expect(t.reduce((s, x) => s + x.amountMinor, 0)).toBe(500);
    expect(t[0]).toMatchObject({ fromStakeholderId: 'b', toStakeholderId: 'a', amountMinor: 300 });
  });
});

describe('money', () => {
  it('parses many formats', () => {
    expect(parseMoney('1,234.50', 'EGP')).toBe(123450);
    expect(parseMoney('EGP 1,234.50', 'EGP')).toBe(123450);
    expect(parseMoney('1234.5', 'USD')).toBe(123450);
    expect(parseMoney('(120.00)', 'USD')).toBe(-12000);
    expect(parseMoney('1.234,50', 'EUR')).toBe(123450);
    expect(parseMoney('1,234', 'USD')).toBe(123400);
    expect(parseMoney('12,5', 'EUR')).toBe(1250);
    expect(parseMoney('abc', 'USD')).toBeNull();
    expect(parseMoney('1500', 'JPY')).toBe(1500);
  });
  it('formats', () => {
    expect(formatMoney(123450, 'USD')).toBe('$1,234.50');
    expect(minorToDecimalString(123450, 'USD')).toBe('1234.50');
    expect(formatMoney(-500, 'USD', { signed: true })).toBe('-$5.00');
  });
});

describe('dates', () => {
  const opts = { today: '2026-10-17', weekStartsOn: 6 };
  it('presets', () => {
    expect(rangeForPreset('today', opts)).toEqual({ from: '2026-10-17', to: '2026-10-17' });
    expect(rangeForPreset('week', opts)).toEqual({ from: '2026-10-17', to: '2026-10-23' });
    expect(rangeForPreset('month', opts)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(rangeForPreset('quarter', opts)).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(rangeForPreset('year', opts)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(rangeForPreset('year', { ...opts, fiscalYearStartMonth: 7 })).toEqual({ from: '2026-07-01', to: '2027-06-30' });
  });
  it('previous range is calendar aware', () => {
    expect(previousRange({ from: '2026-03-01', to: '2026-03-31' })).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(previousRange({ from: '2026-10-10', to: '2026-10-16' })).toEqual({ from: '2026-10-03', to: '2026-10-09' });
  });
  it('buckets without gaps', () => {
    expect(bucketsFor({ from: '2026-01-30', to: '2026-02-02' }, 'day')).toHaveLength(4);
    expect(bucketsFor({ from: '2026-01-01', to: '2026-12-31' }, 'month')).toHaveLength(12);
    expect(autoGranularity({ from: '2026-01-01', to: '2026-12-31' })).toBe('month');
    expect(autoGranularity({ from: '2026-01-01', to: '2026-01-31' })).toBe('day');
  });
  it('recurrence clamps month ends', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(nextOccurrence('2026-01-15', 'quarterly', 1)).toBe('2026-04-15');
  });
});

describe('csv', () => {
  it('parses dates', () => {
    expect(parseDateCell('2026-03-04')).toBe('2026-03-04');
    expect(parseDateCell('04/03/2026')).toBe('2026-03-04');
    expect(parseDateCell('04/03/2026', 'mdy')).toBe('2026-04-03');
    expect(parseDateCell('13/03/2026')).toBe('2026-03-13');
    expect(parseDateCell('45000')).toBe('2023-03-15');
    expect(parseDateCell('nope')).toBeNull();
    expect(detectDateFormat(['13/01/2026', '02/01/2026'])).toBe('dmy');
  });
  it('suggests mappings', () => {
    const m = suggestMapping(['Date', 'Total', 'Memo', 'Cat', 'Payer'], importTargets('expenses'));
    expect(m).toMatchObject({ date: 'Date', amount: 'Total', description: 'Memo', category: 'Cat', paidBy: 'Payer' });
  });
  it('escapes csv', () => {
    expect(toCSV([['a', 'b,c', 'd"e']])).toBe('a,"b,c","d""e"');
  });
});
