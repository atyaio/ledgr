import type { ImportColumn, ImportDateFormat, ImportEntity } from './types';

export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const SYNONYMS: Record<string, string[]> = {
  date: ['date', 'day', 'when', 'transaction date', 'posted', 'paid on', 'received on'],
  amount: ['amount', 'total', 'value', 'price', 'cost', 'sum', 'amt', 'debit', 'credit', 'net'],
  description: ['description', 'desc', 'title', 'memo', 'item', 'details', 'narrative', 'name'],
  category: ['category', 'cat', 'type', 'group', 'bucket'],
  paidBy: ['paid by', 'payer', 'who paid', 'paidby', 'stakeholder', 'partner'],
  receivedBy: ['received by', 'receiver', 'receivedby', 'stakeholder', 'partner', 'account'],
  amountTotal: ['total', 'amount', 'sum'],
  vendor: ['vendor', 'merchant', 'supplier', 'payee', 'shop', 'store'],
  source: ['source', 'client', 'customer', 'payer', 'platform', 'channel'],
  notes: ['notes', 'note', 'comment', 'comments', 'remarks'],
  name: ['name', 'stakeholder', 'partner', 'person', 'full name'],
  email: ['email', 'e mail', 'mail'],
  sharePercent: ['share', 'percentage', 'percent', 'share percent', 'ownership', 'equity', 'stake'],
  joinedAt: ['joined', 'joined at', 'join date', 'since', 'start date'],
  kind: ['kind', 'type'],
  color: ['color', 'colour'],
  monthlyBudget: ['budget', 'monthly budget', 'limit'],
  from: ['from', 'payer', 'from stakeholder', 'sender'],
  to: ['to', 'payee', 'to stakeholder', 'receiver', 'recipient'],
  splitMode: ['split', 'split mode'],
};

export function importTargets(
  entity: ImportEntity,
  customFields: { key: string; label: string; required: boolean }[] = [],
  paymentMethods: { id: string; name: string }[] = [],
): ImportColumn[] {
  const cf = customFields.map<ImportColumn>((f) => ({ key: `cf:${f.key}`, label: f.label, required: f.required, description: 'Custom field' }));
  const pm = paymentMethods.map<ImportColumn>((m) => ({ key: `pm:${m.id}`, label: m.name, required: false, description: 'Amount received this way' }));
  switch (entity) {
    // Column order mirrors the dashboard tables: date, description, category, party, custom columns, amount, then extras.
    case 'expenses':
      return [
        { key: 'date', label: 'Date', required: true },
        { key: 'description', label: 'Description', required: true },
        { key: 'category', label: 'Category', required: true },
        { key: 'paidBy', label: 'Paid by', required: false, description: 'Stakeholder name; blank = company account' },
        ...cf,
        ...pm,
        { key: 'amount', label: pm.length ? 'Total' : 'Amount', required: pm.length === 0, description: pm.length ? 'Blank = sum of the payment columns' : undefined },
        { key: 'vendor', label: 'Vendor', required: false },
        { key: 'notes', label: 'Notes', required: false },
      ];
    case 'revenue':
      return [
        { key: 'date', label: 'Date', required: true },
        { key: 'description', label: 'Description', required: true },
        { key: 'category', label: 'Category', required: false },
        { key: 'source', label: 'Source', required: false },
        { key: 'receivedBy', label: 'Received by', required: false, description: 'Stakeholder name; blank = company account' },
        ...cf,
        ...pm,
        { key: 'amount', label: pm.length ? 'Total' : 'Amount', required: pm.length === 0, description: pm.length ? 'Blank = sum of the payment columns' : undefined },
        { key: 'notes', label: 'Notes', required: false },
      ];
    case 'stakeholders':
      return [
        { key: 'name', label: 'Name', required: true },
        { key: 'sharePercent', label: 'Share %', required: true },
        { key: 'email', label: 'Email', required: false },
        { key: 'joinedAt', label: 'Joined at', required: false },
        { key: 'notes', label: 'Notes', required: false },
        ...cf,
      ];
    case 'categories':
      return [
        { key: 'name', label: 'Name', required: true },
        { key: 'kind', label: 'Kind', required: true, description: 'expense or revenue' },
        { key: 'color', label: 'Color', required: false },
        { key: 'monthlyBudget', label: 'Monthly budget', required: false },
      ];
    case 'settlements':
      return [
        { key: 'date', label: 'Date', required: true },
        { key: 'from', label: 'From', required: true },
        { key: 'to', label: 'To', required: false, description: 'Stakeholder name; blank = company pool' },
        { key: 'amount', label: 'Amount', required: true },
        { key: 'notes', label: 'Note', required: false },
      ];
  }
}

/** Suggest which source header feeds each target. Exact label/key matches first, then synonyms. */
export function suggestMapping(headers: string[], targets: ImportColumn[]): Record<string, string | null> {
  const norm = headers.map((h) => ({ raw: h, n: normalizeHeader(h) }));
  const used = new Set<string>();
  const mapping: Record<string, string | null> = {};
  const pick = (pred: (n: string) => boolean): string | null => {
    const hit = norm.find((h) => !used.has(h.raw) && pred(h.n));
    if (!hit) return null;
    used.add(hit.raw);
    return hit.raw;
  };
  // Pass 1: exact label / key
  for (const t of targets) {
    const label = normalizeHeader(t.label);
    const key = normalizeHeader(t.key.replace(/^cf:/, ''));
    mapping[t.key] = pick((n) => n === label || n === key);
  }
  // Pass 2: synonyms
  for (const t of targets) {
    if (mapping[t.key]) continue;
    const syn = SYNONYMS[t.key] ?? [];
    mapping[t.key] = pick((n) => syn.includes(n)) ?? pick((n) => syn.some((s) => n.includes(s) && s.length > 3));
  }
  return mapping;
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** Parse a date cell into YYYY-MM-DD. */
export function parseDateCell(raw: string | number | null | undefined, format: ImportDateFormat = 'auto'): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return fromExcelSerial(raw);
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{5}(\.\d+)?$/.test(s)) return fromExcelSerial(Number(s));
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (iso) return build(+iso[1], +iso[2], +iso[3]);
  const sep = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (sep) {
    const a = +sep[1];
    const b = +sep[2];
    let y = +sep[3];
    if (y < 100) y += 2000;
    if (format === 'mdy') return build(y, a, b);
    if (format === 'dmy') return build(y, b, a);
    // auto: unambiguous when one part > 12; default day-first.
    if (a > 12 && b <= 12) return build(y, b, a);
    if (b > 12 && a <= 12) return build(y, a, b);
    return build(y, b, a);
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return build(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return null;
}

function fromExcelSerial(n: number): string | null {
  if (!Number.isFinite(n) || n < 1 || n > 80000) return null;
  const d = new Date(EXCEL_EPOCH + Math.floor(n) * 86_400_000);
  return build(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function build(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2999) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Guess whether a column of date strings is day-first or month-first. */
export function detectDateFormat(cells: string[]): ImportDateFormat {
  let dmy = 0;
  let mdy = 0;
  let iso = 0;
  for (const c of cells) {
    const s = (c ?? '').trim();
    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) iso++;
    const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-]\d{2,4}$/);
    if (m) {
      if (+m[1] > 12) dmy++;
      if (+m[2] > 12) mdy++;
    }
  }
  if (iso && !dmy && !mdy) return 'iso';
  if (dmy && !mdy) return 'dmy';
  if (mdy && !dmy) return 'mdy';
  return 'auto';
}

/** RFC 4180 CSV serialisation of rows. */
export function toCSV(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = c === null || c === undefined ? '' : String(c);
          return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\r\n');
}
