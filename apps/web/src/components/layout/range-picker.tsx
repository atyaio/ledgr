import { clsx } from 'clsx';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RANGE_PRESETS, daysBetween, type RangePreset } from '@ledgr/shared';
import { useDateRange } from '@/lib/range';
import { useProject } from '@/lib/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/dialog';
import { useI18n } from '@/i18n';

/** Period control: preset chips + prev/next + custom range dialog. Scrolls horizontally on phones. */
export function RangePicker({ className }: { className?: string }) {
  const { range, preset, setPreset, setRange, shift } = useDateRange();
  const { date } = useProject();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(range);
  useEffect(() => setDraft(range), [range]);

  const days = daysBetween(range.from, range.to) + 1;
  const label = range.from === range.to ? date(range.from, 'medium') : `${date(range.from, 'short')} – ${date(range.to)}`;

  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-1 px-1">
        <button type="button" className="size-8 shrink-0 inline-flex items-center justify-center rounded-full text-ink-2 hover:bg-card-hover" onClick={() => shift(-1)} aria-label={t('Previous period')}>
          <ChevronLeft className="size-4 rtl-flip" />
        </button>
        {RANGE_PRESETS.filter((p) => p.id !== 'custom').map((p) => (
          <button
            type="button"
            key={p.id}
            title={t(p.label)}
            onClick={() => setPreset(p.id as RangePreset)}
            className={clsx(
              'h-8 px-3 shrink-0 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap',
              preset === p.id ? 'bg-primary text-primary-ink' : 'bg-card border border-line text-ink-2 hover:text-ink hover:bg-card-hover',
            )}
          >
            {t(p.id === 'today' ? 'Day' : p.id === 'week' ? 'Week' : p.id === 'month' ? 'Month' : p.id === 'quarter' ? 'Quarter' : p.id === 'year' ? 'Year' : p.id === 'last30' ? '30d' : '12m')}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={clsx(
            'h-8 px-3 shrink-0 inline-flex items-center gap-1.5 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap',
            preset === 'custom' ? 'bg-primary text-primary-ink' : 'bg-card border border-line text-ink-2 hover:text-ink hover:bg-card-hover',
          )}
        >
          <CalendarDays className="size-3.5" />
          <span className="num">{label}</span>
          <span className="num opacity-60 hidden md:inline">{t('· {days}d', { days })}</span>
        </button>
        <button type="button" className="size-8 shrink-0 inline-flex items-center justify-center rounded-full text-ink-2 hover:bg-card-hover" onClick={() => shift(1)} aria-label={t('Next period')}>
          <ChevronRight className="size-4 rtl-flip" />
        </button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('Custom range')}
        footer={
          <>
            <Button variant="ghost" size="md" onClick={() => setOpen(false)}>
              {t('Cancel')}
            </Button>
            <Button
              variant="primary"
              size="md"
              disabled={!draft.from || !draft.to || draft.from > draft.to}
              onClick={() => {
                setRange(draft);
                setOpen(false);
              }}
            >
              {t('Apply')}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label block mb-1.5">{t('From')}</span>
            <Input type="date" value={draft.from} max={draft.to} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} mono />
          </label>
          <label className="block">
            <span className="label block mb-1.5">{t('To')}</span>
            <Input type="date" value={draft.to} min={draft.from} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} mono />
          </label>
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          {(['last7', 'last90', 'all'] as RangePreset[]).map((p) => (
            <Button key={p} size="xs" variant="soft" onClick={() => { setPreset(p); setOpen(false); }}>
              {t(p === 'last7' ? 'Last 7 days' : p === 'last90' ? 'Last 90 days' : 'All time')}
            </Button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
