import { MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CustomFieldDefinition, Expense } from '@ledgr/shared';
import { useDateRange } from '@/lib/range';
import { useProject } from '@/lib/project';
import { useCategories, useCustomFields, useExpenseMutations, useExpenses, useStakeholders } from '@/lib/queries';
import { downloadFile } from '@/lib/api';
import { LedgerToolbar, useLedgerParams } from '@/components/ledger-toolbar';
import { ExpenseForm } from '@/components/forms/expense-form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/input';
import { EmptyRow, Pagination, Table, Td, Th, Tr } from '@/components/ui/table';
import { PageHeader, Panel } from '@/components/ui/misc';
import { Money } from '@/components/ui/money';
import { Avatar, Chip } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { errorMessage, useToast } from '@/components/ui/toast';
import { CustomCell } from '@/components/custom-cell';

const PAGE = 50;

export function ExpensesPage() {
  const { range } = useDateRange();
  const { date, money } = useProject();
  const p = useLedgerParams();
  const toast = useToast();
  const cats = useCategories('expense', true);
  const sh = useStakeholders();
  const cf = useCustomFields('expense');
  const params = useMemo(
    () => ({ from: range.from, to: range.to, q: p.q, categoryId: p.categoryId, stakeholderId: p.stakeholderId, sort: p.sort, order: p.order, page: p.page, pageSize: PAGE }),
    [range, p.q, p.categoryId, p.stakeholderId, p.sort, p.order, p.page],
  );
  const q = useExpenses(params);
  const { remove, bulkDelete, recompute, recomputeRange } = useExpenseMutations();
  const [editing, setEditing] = useState<Expense | null | undefined>(undefined); // undefined = closed, null = new
  const [confirm, setConfirm] = useState<Expense | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const items = q.data?.items ?? [];
  const defs: CustomFieldDefinition[] = cf.data?.items ?? [];
  const allSelected = items.length > 0 && items.every((e) => selected.has(e.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map((e) => e.id)));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const sortBy = (key: string) => p.set({ sort: key, order: p.sort === key && p.order === 'desc' ? 'asc' : 'desc' });
  const sorted = (key: string) => (p.sort === key ? p.order : null);

  const onDelete = async () => {
    if (!confirm) return;
    try { await remove.mutateAsync(confirm.id); toast.success('Expense deleted'); setConfirm(null); } catch (e) { toast.error('Delete failed', errorMessage(e)); }
  };
  const onBulkDelete = async () => {
    try { await bulkDelete.mutateAsync([...selected]); toast.success(`${selected.size} expenses deleted`); setSelected(new Set()); setBulkConfirm(false); } catch (e) { toast.error('Delete failed', errorMessage(e)); }
  };

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle={q.data ? <>{q.data.totals.count} entries · <Money minor={q.data.totals.amountMinor} className="text-ink" /> in range</> : 'Loading…'}
        actions={
          <>
            <Menu
              trigger={() => <Button variant="outline" icon={<MoreHorizontal className="size-3.5" />}>More</Button>}
            >
              {(close) => (
                <>
                  <MenuItem icon={<RefreshCw />} onClick={async () => { close(); try { const r = await recomputeRange.mutateAsync({ from: range.from, to: range.to }); toast.success(`Re-split ${r.updated} ownership-mode expenses`); } catch (e) { toast.error('Recompute failed', errorMessage(e)); } }}>
                    Re-split range by current ownership
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem icon={<Trash2 />} danger disabled={!selected.size} onClick={() => { close(); setBulkConfirm(true); }}>
                    Delete {selected.size || ''} selected
                  </MenuItem>
                </>
              )}
            </Menu>
            <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing(null)}>
              New expense
            </Button>
          </>
        }
      />
      <div className="mb-3">
        <LedgerToolbar
          categories={cats.data?.items.filter((c) => !c.archived) ?? []}
          stakeholders={sh.data?.items ?? []}
          stakeholderLabel="Paid by"
          onExport={() => downloadFile('/export/expenses.csv', 'expenses.csv', { from: range.from, to: range.to }).catch((e) => toast.error('Export failed', errorMessage(e)))}
        />
      </div>
      <Panel>
        <Table>
          <thead>
            <tr>
              <Th className="w-8"><Checkbox checked={allSelected} onChange={toggleAll} aria-label="Select all" /></Th>
              <Th sortable sorted={sorted('date')} onSort={() => sortBy('date')} className="w-24">Date</Th>
              <Th sortable sorted={sorted('description')} onSort={() => sortBy('description')}>Description</Th>
              <Th>Category</Th>
              <Th>Paid by</Th>
              <Th className="w-20">Split</Th>
              {defs.map((d) => <Th key={d.id} align={d.type === 'money' || d.type === 'number' ? 'right' : 'left'}>{d.label}</Th>)}
              <Th align="right" sortable sorted={sorted('amountMinor')} onSort={() => sortBy('amountMinor')} className="w-32">Amount</Th>
              <Th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {q.isPending && <EmptyRow colSpan={9 + defs.length}>Loading…</EmptyRow>}
            {!q.isPending && !items.length && <EmptyRow colSpan={9 + defs.length}>No expenses match. Try a wider date range or clear filters.</EmptyRow>}
            {items.map((e) => (
              <ExpenseRow key={e.id} e={e} defs={defs} selected={selected.has(e.id)} onToggle={() => toggle(e.id)} expanded={expanded === e.id} onExpand={() => setExpanded(expanded === e.id ? null : e.id)} onEdit={() => setEditing(e)} onDelete={() => setConfirm(e)} onRecompute={async () => { try { await recompute.mutateAsync(e.id); toast.success('Split recomputed'); } catch (err) { toast.error('Recompute failed', errorMessage(err)); } }} date={date} money={money} />
            ))}
          </tbody>
          {q.data && items.length > 0 && (
            <tfoot>
              <tr className="bg-sunken/50">
                <td colSpan={6 + defs.length} className="h-9 px-3 eyebrow">Page total · {items.length} rows</td>
                <td className="h-9 px-3 text-right num font-medium"><Money minor={items.reduce((a, b) => a + b.amountMinor, 0)} /></td>
                <td />
              </tr>
            </tfoot>
          )}
        </Table>
        {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(n) => p.set({ page: String(n) })} />}
      </Panel>

      <ExpenseForm open={editing !== undefined} onClose={() => setEditing(undefined)} expense={editing ?? null} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={onDelete} loading={remove.isPending} title="Delete this expense?" description={confirm ? `${confirm.description} · ${money(confirm.amountMinor)} on ${date(confirm.date)}. Its split snapshot is removed too.` : ''} />
      <ConfirmDialog open={bulkConfirm} onClose={() => setBulkConfirm(false)} onConfirm={onBulkDelete} loading={bulkDelete.isPending} title={`Delete ${selected.size} expenses?`} description="This cannot be undone. Export first if you want a copy." />
    </>
  );
}

function ExpenseRow({ e, defs, selected, onToggle, expanded, onExpand, onEdit, onDelete, onRecompute, date, money }: { e: Expense; defs: CustomFieldDefinition[]; selected: boolean; onToggle: () => void; expanded: boolean; onExpand: () => void; onEdit: () => void; onDelete: () => void; onRecompute: () => void; date: (s: string, st?: 'short' | 'medium' | 'long') => string; money: (m: number) => string }) {
  return (
    <>
      <Tr selected={selected} className="cursor-pointer" onClick={onExpand}>
        <Td onClick={(ev) => ev.stopPropagation()}><Checkbox checked={selected} onChange={onToggle} aria-label="Select" /></Td>
        <Td className="num text-ink-2 whitespace-nowrap">{date(e.date)}</Td>
        <Td>
          <div className="font-medium truncate max-w-[360px]">{e.description}</div>
          {(e.vendor || e.recurringRuleId) && <div className="text-[11px] text-ink-3 truncate">{e.vendor}{e.recurringRuleId && <span className="ml-1 eyebrow !text-[9.5px]">· recurring</span>}</div>}
        </Td>
        <Td>{e.category && <Chip color={e.category.color}>{e.category.name}</Chip>}</Td>
        <Td>{e.paidBy ? <span className="inline-flex items-center gap-1.5"><Avatar name={e.paidBy.name} color={e.paidBy.color} size={18} /><span className="truncate">{e.paidBy.name}</span></span> : <span className="text-ink-3">Company pool</span>}</Td>
        <Td><span className="eyebrow !text-[10px]">{e.splitMode === 'custom' ? 'custom' : 'owner %'}</span></Td>
        {defs.map((d) => <Td key={d.id} align={d.type === 'money' || d.type === 'number' ? 'right' : 'left'}><CustomCell def={d} value={e.customFields?.[d.key]} /></Td>)}
        <Td align="right"><Money minor={e.amountMinor} className="font-medium" /></Td>
        <Td onClick={(ev) => ev.stopPropagation()}>
          <Menu trigger={() => <button className="size-6 inline-flex items-center justify-center rounded text-ink-3 hover:text-ink hover:bg-hover" aria-label="Actions"><MoreHorizontal className="size-3.5" /></button>}>
            {(close) => (
              <>
                <MenuItem icon={<Pencil />} onClick={() => { close(); onEdit(); }}>Edit</MenuItem>
                <MenuItem icon={<RefreshCw />} onClick={() => { close(); onRecompute(); }}>Re-split by current ownership</MenuItem>
                <MenuSeparator />
                <MenuItem icon={<Trash2 />} danger onClick={() => { close(); onDelete(); }}>Delete</MenuItem>
              </>
            )}
          </Menu>
        </Td>
      </Tr>
      {expanded && (
        <tr className="bg-sunken/40">
          <td colSpan={9 + defs.length} className="px-3 py-2.5 border-b border-line">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12px]">
              <div>
                <div className="eyebrow mb-1">Split</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {e.splits.map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-1.5"><span className="text-ink-2">{s.stakeholderName ?? s.stakeholderId}</span><span className="num text-ink-3">{s.sharePercent.toFixed(2)}%</span><span className="num">{money(s.amountMinor)}</span></span>
                  ))}
                  {!e.splits.length && <span className="text-ink-3">No stakeholders at the time of entry.</span>}
                </div>
              </div>
              {e.notes && <div className="max-w-md"><div className="eyebrow mb-1">Notes</div><div className="text-ink-2 whitespace-pre-wrap">{e.notes}</div></div>}
              <div className="ml-auto text-ink-3 num text-[11px] self-end">id {e.id.slice(-8)} · updated {new Date(e.updatedAt).toLocaleString()}</div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
