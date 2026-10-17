import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CustomFieldDefinition, Revenue } from '@ledgr/shared';
import { useDateRange } from '@/lib/range';
import { useProject } from '@/lib/project';
import { useCategories, useCustomFields, useRevenue, useRevenueMutations, useStakeholders } from '@/lib/queries';
import { downloadFile } from '@/lib/api';
import { LedgerToolbar, useLedgerParams } from '@/components/ledger-toolbar';
import { RevenueForm } from '@/components/forms/revenue-form';
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

export function RevenuePage() {
  const { range } = useDateRange();
  const { date, money } = useProject();
  const p = useLedgerParams();
  const toast = useToast();
  const cats = useCategories('revenue', true);
  const sh = useStakeholders();
  const cf = useCustomFields('revenue');
  const params = useMemo(
    () => ({ from: range.from, to: range.to, q: p.q, categoryId: p.categoryId, stakeholderId: p.stakeholderId, sort: p.sort, order: p.order, page: p.page, pageSize: PAGE }),
    [range, p.q, p.categoryId, p.stakeholderId, p.sort, p.order, p.page],
  );
  const q = useRevenue(params);
  const { remove, bulkDelete } = useRevenueMutations();
  const [editing, setEditing] = useState<Revenue | null | undefined>(undefined);
  const [confirm, setConfirm] = useState<Revenue | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);

  const items = q.data?.items ?? [];
  const defs: CustomFieldDefinition[] = cf.data?.items ?? [];
  const allSelected = items.length > 0 && items.every((e) => selected.has(e.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map((e) => e.id)));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const sortBy = (key: string) => p.set({ sort: key, order: p.sort === key && p.order === 'desc' ? 'asc' : 'desc' });
  const sorted = (key: string) => (p.sort === key ? p.order : null);

  return (
    <>
      <PageHeader
        title="Revenue"
        subtitle={q.data ? <>{q.data.totals.count} entries · <Money minor={q.data.totals.amountMinor} className="text-ink" /> in range</> : 'Loading…'}
        actions={
          <>
            {selected.size > 0 && <Button variant="danger" icon={<Trash2 className="size-3.5" />} onClick={() => setBulkConfirm(true)}>Delete {selected.size}</Button>}
            <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing(null)}>New revenue</Button>
          </>
        }
      />
      <div className="mb-3">
        <LedgerToolbar
          categories={cats.data?.items.filter((c) => !c.archived) ?? []}
          stakeholders={sh.data?.items ?? []}
          stakeholderLabel="Received by"
          onExport={() => downloadFile('/export/revenue.csv', 'revenue.csv', { from: range.from, to: range.to }).catch((e) => toast.error('Export failed', errorMessage(e)))}
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
              <Th>Source</Th>
              <Th>Received by</Th>
              {defs.map((d) => <Th key={d.id} align={d.type === 'money' || d.type === 'number' ? 'right' : 'left'}>{d.label}</Th>)}
              <Th align="right" sortable sorted={sorted('amountMinor')} onSort={() => sortBy('amountMinor')} className="w-32">Amount</Th>
              <Th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {q.isPending && <EmptyRow colSpan={8 + defs.length}>Loading…</EmptyRow>}
            {!q.isPending && !items.length && <EmptyRow colSpan={8 + defs.length}>No revenue in this range.</EmptyRow>}
            {items.map((r) => (
              <Tr key={r.id} selected={selected.has(r.id)}>
                <Td><Checkbox checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label="Select" /></Td>
                <Td className="num text-ink-2 whitespace-nowrap">{date(r.date)}</Td>
                <Td>
                  <div className="font-medium truncate max-w-[360px]">{r.description}</div>
                  {(r.notes || r.recurringRuleId) && <div className="text-[11px] text-ink-3 truncate max-w-[360px]">{r.notes}{r.recurringRuleId && <span className="ml-1 eyebrow !text-[9.5px]">· recurring</span>}</div>}
                </Td>
                <Td>{r.category ? <Chip color={r.category.color}>{r.category.name}</Chip> : <span className="text-ink-4">—</span>}</Td>
                <Td className="text-ink-2">{r.source ?? <span className="text-ink-4">—</span>}</Td>
                <Td>{r.receivedBy ? <span className="inline-flex items-center gap-1.5"><Avatar name={r.receivedBy.name} color={r.receivedBy.color} size={18} />{r.receivedBy.name}</span> : <span className="text-ink-3">Company pool</span>}</Td>
                {defs.map((d) => <Td key={d.id} align={d.type === 'money' || d.type === 'number' ? 'right' : 'left'}><CustomCell def={d} value={r.customFields?.[d.key]} /></Td>)}
                <Td align="right"><Money minor={r.amountMinor} className="font-medium" /></Td>
                <Td>
                  <Menu trigger={() => <button className="size-6 inline-flex items-center justify-center rounded text-ink-3 hover:text-ink hover:bg-hover" aria-label="Actions"><MoreHorizontal className="size-3.5" /></button>}>
                    {(close) => (
                      <>
                        <MenuItem icon={<Pencil />} onClick={() => { close(); setEditing(r); }}>Edit</MenuItem>
                        <MenuSeparator />
                        <MenuItem icon={<Trash2 />} danger onClick={() => { close(); setConfirm(r); }}>Delete</MenuItem>
                      </>
                    )}
                  </Menu>
                </Td>
              </Tr>
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

      <RevenueForm open={editing !== undefined} onClose={() => setEditing(undefined)} revenue={editing ?? null} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={async () => { try { await remove.mutateAsync(confirm!.id); toast.success('Revenue deleted'); setConfirm(null); } catch (e) { toast.error('Delete failed', errorMessage(e)); } }} loading={remove.isPending} title="Delete this revenue entry?" description={confirm ? `${confirm.description} · ${money(confirm.amountMinor)} on ${date(confirm.date)}` : ''} />
      <ConfirmDialog open={bulkConfirm} onClose={() => setBulkConfirm(false)} onConfirm={async () => { try { await bulkDelete.mutateAsync([...selected]); toast.success(`${selected.size} entries deleted`); setSelected(new Set()); setBulkConfirm(false); } catch (e) { toast.error('Delete failed', errorMessage(e)); } }} loading={bulkDelete.isPending} title={`Delete ${selected.size} entries?`} description="This cannot be undone." />
    </>
  );
}
