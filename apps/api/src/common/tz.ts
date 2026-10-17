/** Date helpers for turning provider UTC timestamps into the ledger's local days. */

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string | undefined, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${tz ?? 'local'}|${JSON.stringify(opts)}`;
  let f = cache.get(key);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-CA', { ...opts, timeZone: tz });
    } catch {
      f = new Intl.DateTimeFormat('en-CA', opts); // unknown zone → machine zone
    }
    cache.set(key, f);
  }
  return f;
}

/** `YYYY-MM-DD` of an instant in `tz` (IANA name; undefined = machine zone). */
export function localDate(iso: string | Date, tz?: string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return formatter(tz, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** `HH:mm` of an instant in `tz`. */
export function localTime(iso: string | Date, tz?: string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return formatter(tz, { hour: '2-digit', minute: '2-digit', hour12: false }).format(d).replace(/^24/, '00');
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function machineTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
