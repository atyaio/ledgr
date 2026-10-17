import { clsx } from 'clsx';
import { Check, Download, RefreshCw, Store } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { LoyverseShiftPreview, PullShiftResponse } from '@ledgr/shared';
import { useLoyverseMutations, useLoyverseShifts } from '@/lib/queries';
import { useProject } from '@/lib/project';
import { useI18n } from '@/i18n';
import { Sheet } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState, Loading } from '@/components/ui/misc';
import { errorMessage, useToast } from '@/components/ui/toast';
import { ShiftSalesList } from './shift-sales';

/** Formats a UTC instant in the project's zone as a short local time. */
export function useShiftClock() {
  const { locale, project } = useProject();
  const tz = project.config.timezone;
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const day = new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', month: 'short', timeZone: tz });
  return {
    time: (iso: string) => time.format(new Date(iso)),
    day: (iso: string) => day.format(new Date(iso)),
    window: (from: string, to: string) => `${time.format(new Date(from))} – ${time.format(new Date(to))}`,
  };
}

/**
 * "Pull last shift": lists the latest closed Loyverse shifts; one tap pulls a shift into a
 * revenue row (cash only by default), re-pulling updates the same row.
 */
export function PullShiftSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { money } = useProject();
  const toast = useToast();
  const clock = useShiftClock();
  const q = useLoyverseShifts(open);
  const { pullShift } = useLoyverseMutations();
  const [result, setResult] = useState<PullShiftResponse | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => {
    if (open) setResult(null);
  }, [open]);

  const pull = async (s: LoyverseShiftPreview) => {
    setBusyId(s.externalId);
    try {
      const r = await pullShift.mutateAsync({ shiftId: s.externalId });
      setResult(r);
      toast.success(t(r.created ? 'Shift added to revenue' : 'Shift revenue updated'), `${r.revenue.description} · ${money(r.revenue.amountMinor)}`);
    } catch (e) {
      toast.error(t('Could not pull the shift'), errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const latest = q.data?.[0];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={result ? t('Shift pulled') : t('Pull a shift from Loyverse')}
      description={result ? result.revenue.description : t('Closed shifts, newest first. Only the payment types chosen in the integration settings go on the row.')}
      width={520}
      footer={
        result ? (
          <>
            <Button variant="ghost" size="md" onClick={() => setResult(null)}>{t('Pull another')}</Button>
            <Button variant="primary" size="md" onClick={onClose}>{t('Done')}</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="md" icon={<RefreshCw className={clsx('size-4', q.isFetching && 'animate-spin')} />} onClick={() => q.refetch()} disabled={q.isFetching}>{t('Refresh')}</Button>
            <Button variant="primary" size="md" icon={<Download className="size-4" />} loading={!!busyId && busyId === latest?.externalId} disabled={!latest || !!busyId} onClick={() => latest && pull(latest)}>
              {latest?.pulled ? t('Re-pull last shift') : t('Pull last shift')}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-4">
          <div className="card p-4 flex items-center gap-3">
            <span className="size-10 rounded-full bg-revenue-soft text-revenue inline-flex items-center justify-center shrink-0"><Check className="size-5" /></span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-ink-3">{t(result.created ? 'New revenue row' : 'Existing row updated')}</div>
              <div className="num text-[22px] font-semibold tracking-tight text-revenue">{money(result.revenue.amountMinor)}</div>
              <div className="text-[12.5px] text-ink-3 truncate">{result.revenue.payments.filter((p) => p.amountMinor > 0).map((p) => `${p.name} ${money(p.amountMinor, { compact: true })}`).join(' · ')}</div>
            </div>
          </div>
          <ShiftSalesList sales={result.sales} compact />
        </div>
      ) : q.isPending ? (
        <Loading label={t('Asking Loyverse for the latest shifts')} />
      ) : q.isError ? (
        <EmptyState title={t('Could not reach Loyverse')} description={q.error.message} action={<Link to="/integrations"><Button variant="soft" size="sm">{t('Integration settings')}</Button></Link>} />
      ) : !q.data.length ? (
        <EmptyState icon={<Store />} title={t('No closed shifts yet')} description={t('Close the shift in the Loyverse POS app, then pull it here.')} />
      ) : (
        <ul className="divide-y divide-line -mx-1">
          {q.data.map((s, i) => {
            const selected = s.payments.filter((p) => p.selected && p.amountMinor !== 0);
            const pulledAmount = selected.reduce((a, p) => a + p.amountMinor, 0);
            return (
              <li key={s.externalId} className={clsx('flex items-center gap-3 px-1 py-3', i === 0 && 'bg-accent-soft/40 rounded-[12px]')}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14.5px] font-medium">{clock.day(s.closedAt)}</span>
                    <span className="num text-[12.5px] text-ink-3">{clock.window(s.openedAt, s.closedAt)}</span>
                    {s.storeName && <Badge>{s.storeName}</Badge>}
                    {s.pulled && <Badge tone={s.pulled.revenueId ? 'good' : 'warning'}>{s.pulled.revenueId ? t('in ledger') : t('row deleted')}</Badge>}
                  </div>
                  <div className="text-[12.5px] text-ink-3 mt-0.5 truncate">
                    {selected.length ? selected.map((p) => `${p.name} ${money(p.amountMinor, { compact: true })}`).join(' · ') : t('nothing through the selected payment types')}
                    {s.netSalesMinor ? <span> · {t('net sales {amount}', { amount: money(s.netSalesMinor, { compact: true }) })}</span> : null}
                  </div>
                </div>
                <div className="text-end shrink-0">
                  <div className="num text-[15px] font-semibold text-revenue">{money(pulledAmount)}</div>
                  <Button size="xs" variant={i === 0 ? 'primary' : 'secondary'} className="mt-1" loading={busyId === s.externalId} disabled={!!busyId} onClick={() => pull(s)}>{s.pulled?.revenueId ? t('Re-pull') : t('Pull')}</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
