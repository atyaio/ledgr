import { clsx } from 'clsx';
import { Check, ChevronDown, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useIsMobile } from '@/lib/media';
import { Swatch } from './badge';
import { useI18n } from '@/i18n';

export interface MultiOption {
  id: string;
  label: string;
  color?: string;
  hint?: string;
}

/** Filter chip that opens a checklist; shows "All" when nothing is selected. */
export function MultiSelect({ label, options, value, onChange, icon }: { label: string; options: MultiOption[]; value: string[]; onChange: (ids: string[]) => void; icon?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const mobile = useIsMobile();
  const { t } = useI18n();
  const selected = options.filter((o) => value.includes(o.id));
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = ref.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 280) });
    };
    place();
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k);
      window.removeEventListener('resize', place);
    };
  }, [open]);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const summary = selected.length === 0 ? t('All') : selected.length === 1 ? selected[0].label : t('{n} selected', { n: selected.length });
  const list = (
    <ul className="max-h-[320px] overflow-y-auto py-1">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <li key={o.id}>
            <button type="button" onClick={() => toggle(o.id)} className="w-full flex items-center gap-2.5 px-3 h-10 md:h-9 text-start text-[14px] md:text-[13.5px] hover:bg-card-hover">
              <span className={clsx('size-[18px] rounded-[5px] border inline-flex items-center justify-center shrink-0', on ? 'bg-accent border-accent text-white' : 'border-line-strong')}>{on && <Check className="size-3" />}</span>
              {o.color && <Swatch color={o.color} />}
              <span className="flex-1 truncate">{o.label}</span>
              {o.hint && <span className="text-[12px] text-ink-3">{o.hint}</span>}
            </button>
          </li>
        );
      })}
      {!options.length && <li className="px-3 py-3 text-[13px] text-ink-3">{t('Nothing to filter by yet.')}</li>}
    </ul>
  );
  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx('h-9 ps-3 pe-2 inline-flex items-center gap-1.5 rounded-full border text-[13.5px] font-medium whitespace-nowrap', selected.length ? 'bg-primary text-primary-ink border-primary' : 'bg-card border-line text-ink-2 hover:text-ink')}
      >
        {icon}
        <span className="opacity-70">{label}:</span> {summary}
        {selected.length ? (
          <span role="button" aria-label={t('Clear {label}', { label })} onClick={(e) => { e.stopPropagation(); onChange([]); }} className="ms-0.5 inline-flex size-5 items-center justify-center rounded-full hover:bg-white/20"><X className="size-3.5" /></span>
        ) : (
          <ChevronDown className="size-4 opacity-70" />
        )}
      </button>
      {open &&
        createPortal(
          mobile ? (
            <div className="fixed inset-0 z-50 flex items-end">
              <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
              <div ref={panelRef} className="relative w-full bg-card rounded-t-[24px] pb-[max(12px,var(--safe-bottom))] shadow-2xl">
                <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line-strong" />
                <div className="px-4 pt-3 pb-1 text-[15px] font-semibold">{label}</div>
                {list}
              </div>
            </div>
          ) : (
            <div ref={panelRef} style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, zIndex: 60, visibility: pos ? 'visible' : 'hidden' }} className="w-[270px] card shadow-[var(--shadow-pop)]">
              {list}
            </div>
          ),
          document.body,
        )}
    </div>
  );
}
