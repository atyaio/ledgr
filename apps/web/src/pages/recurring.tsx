import { clsx } from 'clsx';
import { MoreHorizontal, Pause, Pencil, Play, Plus, Trash2, Zap } from 'lucide-react';
import { useState } from 'react';
import type { RecurringRule } from '@ledgr/shared';
import { useProject } from '@/lib/project';
import { useRecurring, useRecurringMutations } from '@/lib/queries';
import { RecurringForm } from '@/components/forms/recurring-form';
import { Button } from '@/components/ui/button';
import { Loading, PageHeader, Panel } from '@/components/ui/misc';
import { EmptyRow, Table, Td, Th, Tr } from '@/components/ui/table';
import { Money } from '@/components/ui/money';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { errorMessage, useToast } from '@/components/ui/toast';

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
      toast.success(r.generated.length ? `Generated ${r.generated.length} entries` : 'Nothing due', r.generated.length ? r.generated.map((g) => `${g.kind} on ${g.date}`).slice(0, 5).join(', ') : undefined);
    } catch (e) {
      toast.error('Run failed', errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader title="Recurring" subtitle="Rent, retainers, subscriptions: generated on schedule, editable like any entry." actions={<><Button variant="outline" icon={<Zap className="size-3.5" />} onClick={runAll} loading={run.isPending}>Run due now</Button><Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing(null)}>New rule</Button></>} />
      <Panel>
        {q.isPending ? <Loading /> : (
          <Table>
            <thead><tr><Th>Rule</Th><Th>Kind</Th><Th>Schedule</Th><Th>Next</Th><Th align="right">Amount</Th><Th align="right">Generated</Th><Th>Status</Th><Th className="w-10" /></tr></thead>
            <tbody>
              {!items.length && <EmptyRow colSpan={8}>No recurring rules. Create one for rent, salaries or retainers.</EmptyRow>}
              {items.map((r) => {
                const due = r.active && r.nextRunAt <= today;
                return (
                  <Tr key={r.id} className={clsx(!r.active && 'opacity-60')}>
                    <Td><div className="font-medium">{r.name}</div><div className="text-[11px] text-ink-3 truncate max-w-[300px]">{r.template.description}</div></Td>
                    <Td><Badge tone={r.kind === 'expense' ? 'warning' : 'good'}>{r.kind}</Badge></Td>
                    <Td className="text-ink-2">every {r.interval > 1 ? `${r.interval} ` : ''}{r.frequency.replace('ly', r.interval > 1 ? (r.frequency === 'daily' ? ' days' : r.frequency === 'monthly' ? ' months' : r.frequency === 'weekly' ? ' weeks' : r.frequency === 'yearly' ? ' years' : ' quarters') : '')}{r.interval === 1 && <span className="text-ink-3"> · {r.frequency}</span>}</Td>
                    <Td className="num"><span className={clsx(due && 'text-warning')}>{date(r.nextRunAt)}</span>{r.endDate && <span className="text-ink-3 text-[11px]"> → {date(r.endDate)}</span>}</Td>
                    <Td align="right"><Money minor={r.template.amountMinor} /></Td>
                    <Td align="right" className="num text-ink-2">{r.generatedCount}{r.lastGeneratedAt && <span className="text-ink-4 text-[10.5px]"> · {date(r.lastGeneratedAt)}</span>}</Td>
                    <Td>{r.active ? <Badge tone={due ? 'warning' : 'good'}>{due ? 'due' : 'active'}</Badge> : <Badge>paused</Badge>}</Td>
                    <Td>
                      <Menu trigger={() => <button className="size-6 inline-flex items-center justify-center rounded text-ink-3 hover:text-ink hover:bg-hover" aria-label="Actions"><MoreHorizontal className="size-3.5" /></button>}>
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
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>
      <RecurringForm open={editing !== undefined} onClose={() => setEditing(undefined)} rule={editing ?? null} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={async () => { try { await remove.mutateAsync(confirm!.id); toast.success('Rule deleted'); setConfirm(null); } catch (e) { toast.error('Delete failed', errorMessage(e)); } }} loading={remove.isPending} title={`Delete rule “${confirm?.name}”?`} description="Entries already generated stay in the ledger." />
    </>
  );
}
