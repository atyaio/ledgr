import { clsx } from 'clsx';

/** Small inline spinner that takes the surrounding text colour (buttons, rows). */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={clsx('animate-spin', className ?? 'size-4')} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Page-level spinner in the brand colour: a soft track with a sweeping arc.
 * `--accent` is the colour picked in Settings → Branding (lightened on dark backgrounds), or ledgr's blue by default.
 */
export function BrandSpinner({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg className={clsx('brand-spinner shrink-0', className)} width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
      <circle cx="20" cy="20" r="16" stroke="var(--accent-soft)" strokeWidth="4" />
      <circle className="brand-spinner-arc" cx="20" cy="20" r="16" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
