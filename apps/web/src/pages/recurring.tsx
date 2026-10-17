import { clsx } from 'clsx';
import { MoreHorizontal, Pause, Pencil, Play, Plus, Repeat, Trash2, Zap } from 'lucide-react';
import { useState } from 'react';
import type { RecurringRule } from '@ledgr/shared';
import { useProject } from '@/lib/project';
import { useRecurring, useRecurringMutations } from '@/lib/queries';
import { RecurringForm } from '@/components/forms/recurring-form';
import { Button } from '@/components/ui/button';
import { EmptyState, Loading, PageHeader, Card, ListRow } from '@/components/ui/misc';
import { Money } from '@/components/ui/money';
import { Badge, Tile } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { errorMessage, useToast } from '@/components/ui/toast';

function schedule(r: RecurringRule): string {
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', quarterly: 'quarter', yearly: 'year' }[r.frequency];
  return r.interval === 1 ? `Every ${unit}` : `Every ${r.interval} ${unit}s`;
}

export function RecurringPage() {
  const q = useRecurring();
  const { update, remove, run } = useRecurringMutations();
  const toast = useToast();
  const { date } = useProject();
  const [editing, setEditing] = useState<RecurringRule | null | undefined>(undefined);
  const [confirm, setConfirm] = useState<RecurringRule | null>(null);
  const items = q.data?.items ?? [];
  const today = new Date().toISOString().slice(0, 10);

  const runAll = async () => {
    try {
      const r = await run.mutateAsync(undefined);
      toast.success(r.generated.length ? `Generated ${r.generated.length} entries` : 'Nothing due right now');
    } catch (e) {
      toast.error('Run failed', errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader title="Recurring" subtitle="Rent, retainers, subscriptions: added automatically when due." actions={<><Button variant="secondary" size="sm" className="rounded-full" icon={<Zap className="size-4" />} onClick={runAll} loading={run.isPending}>Run due now</Button><Button variant="primary" size="sm" className="rounded-full" icon={<Plus className="size-4" />} onClick={() => setEditing(null)}>New rule</Button></>} />
      <Card flush>
        {q.isPending ? <Loading /> : !items.length ? <EmptyState icon={<Repeat />} title="No recurring rules" description="Create one for rent, salaries or retainers and ledgr adds the entries on schedule." action={<Button variant="soft" onClick={() => setEditing(null)}>New rule</Button>} /> : (
          <ul className="divide-y divide-line">
            {items.map((r) => {
              const due = r.active && r.nextRunAt <= today;
              return (
                <li key={r.id} className={clsx('flex items-center', !r.active && 'opacity-60')}>
                  <ListRow
                    className="flex-1"
                    leading={<Tile color={r.kind === 'expense' ? 'var(--s-expense)' : 'var(--s-revenue)'}><Repeat className="size-4" /></Tile>}
                    title={<span className="inline-flex items-center gap-2">{r.name}{!r.active ? <Badge>paused</Badge> : due ? <Badge tone="warning">due</Badge> : null}</span>}
                    subtitle={`${schedule(r)} · next ${date(r.nextRunAt)}${r.endDate ? ` · ends ${date(r.endDate)}` : ''} · ${r.generatedCount} generated`}
                    trailing={<Money minor={r.template.amountMinor} tone={r.kind === 'expense' ? 'expense' : 'revenue'} className="text-[15px] font-semibold" />}
                    onClick={() => setEditing(r)}
                  />
                  <div className="pr-3">
                    <Menu trigger={() => <button type="button" className="size-9 inline-flex items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-card-hover" aria-label="Actions"><MoreHorizontal className="size-4" /></button>}>
                      {(close) => (
                        <>
                          <MenuItem icon={<Pencil />} onClick={() => { close(); setEditing(r); }}>Edit</MenuItem>
                          <MenuItem icon={<Zap />} onClick={async () => { close(); try { const x = await run.mutateAsync(r.id); toast.success(x.generated.length ? `Generated ${x.generated.length}` : 'Nothing due'); } catch (e) { toast.error('Run failed', errorMessage(e)); } }}>Run now</MenuItem>
                          <MenuItem icon={r.active ? <Pause /> : <Play />} onClick={async () => { close(); try { await update.mutateAsync({ id: r.id, active: !r.active }); } catch (e) { toast.error('Failed', errorMessage(e)); } }}>{r.active ? 'Pause' : 'Resume'}</MenuItem>
                          <MenuSeparator />
                          <MenuItem icon={<Trash2 />} danger onClick={() => { close(); setConfirm(r); }}>Delete</MenuItem>
                        </>
                      )}
                    </Menu>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <RecurringForm open={editing !== undefined} onClose={() => setEditing(undefined)} rule={editing ?? null} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={async () => { try { await remove.mutateAsync(confirm!.id); toast.success('Rule deleted'); setConfirm(null); } catch (e) { toast.error('Delete failed', errorMessage(e)); } }} loading={remove.isPending} title={`Delete “${confirm?.name}”?`} description="Entries already generated stay in the ledger." />
    </>
  );
}
