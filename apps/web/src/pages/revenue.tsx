import { clsx } from 'clsx';
import { MoreHorizontal, Pencil, Plus, Trash2, CheckSquare, Square } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CustomFieldDefinition, Revenue } from '@ledgr/shared';
import { useDateRange } from '@/lib/range';
import { useProject } from '@/lib/project';
import { useCategories, useCustomFields, useRevenue, useRevenueMutations, useStakeholders } from '@/lib/queries';
import { downloadFile } from '@/lib/api';
import { useIsMobile } from '@/lib/media';
import { LedgerToolbar, useLedgerParams } from '@/components/ledger-toolbar';
import { RevenueForm } from '@/components/forms/revenue-form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/input';
import { EmptyRow, Pagination, Table, Td, Th, Tr } from '@/components/ui/table';
import { PageHeader, Card, EmptyState } from '@/components/ui/misc';
import { Money } from '@/components/ui/money';
import { Avatar, Chip, Swatch } from '@/components/ui/badge';
import { ConfirmDialog, Modal } from '@/components/ui/dialog';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { errorMessage, useToast } from '@/components/ui/toast';
import { CustomCell } from '@/components/custom-cell';

const PAGE = 50;

export function RevenuePage() {
  const { range } = useDateRange();
  const { date, money } = useProject();
  const p = useLedgerParams();
  const toast = useToast();
  const mobile = useIsMobile();
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
  const [selecting, setSelecting] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [detail, setDetail] = useState<Revenue | null>(null);

  const items = q.data?.items ?? [];
  const defs: CustomFieldDefinition[] = cf.data?.items ?? [];
  const allSelected = items.length > 0 && items.every((e) => selected.has(e.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map((e) => e.id)));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const sortBy = (key: string) => p.set({ sort: key, order: p.sort === key && p.order === 'desc' ? 'asc' : 'desc' });
  const sorted = (key: string) => (p.sort === key ? p.order : null);
  const exportCsv = () => downloadFile('/export/revenue.csv', 'revenue.csv', { from: range.from, to: range.to }).catch((e) => toast.error('Export failed', errorMessage(e)));
  const groups = useMemo(() => {
    const m = new Map<string, Revenue[]>();
    for (const e of items) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return [...m.entries()];
  }, [items]);

  return (
    <>
      <PageHeader
        title="Revenue"
        subtitle={q.data ? <><Money minor={q.data.totals.amountMinor} className="text-ink font-medium" /> across {q.data.totals.count} entries</> : 'Loading…'}
        actions={
          <>
            <Menu trigger={() => <Button variant="secondary" size="sm" icon={<MoreHorizontal className="size-4" />} className="rounded-full">More</Button>} title="Revenue">
              {(close) => (
                <>
                  <MenuItem icon={selecting ? <CheckSquare /> : <Square />} onClick={() => { close(); setSelecting((s) => !s); setSelected(new Set()); }}>{selecting ? 'Done selecting' : 'Select entries'}</MenuItem>
                  <MenuSeparator />
                  <MenuItem icon={<Trash2 />} danger disabled={!selected.size} onClick={() => { close(); setBulkConfirm(true); }}>Delete {selected.size || ''} selected</MenuItem>
                </>
              )}
            </Menu>
            <Button variant="primary" size="sm" className="rounded-full max-md:hidden" icon={<Plus className="size-4" />} onClick={() => setEditing(null)}>New revenue</Button>
          </>
        }
      />
      <div className="mb-3">
        <LedgerToolbar categories={cats.data?.items.filter((c) => !c.archived) ?? []} stakeholders={sh.data?.items ?? []} stakeholderLabel="Received by" onExport={exportCsv} />
      </div>
      {selecting && items.length > 0 && (
        <div className="mb-3 flex items-center justify-between gap-2 card px-4 py-2 fade-up">
          <Checkbox label={allSelected ? 'Deselect all on page' : 'Select all on page'} checked={allSelected} onChange={toggleAll} />
          <div className="flex items-center gap-2">
            <Button size="xs" variant="ghost" onClick={() => { setSelecting(false); setSelected(new Set()); }}>Done</Button>
            <Button size="xs" variant="danger" disabled={!selected.size} icon={<Trash2 className="size-3.5" />} onClick={() => setBulkConfirm(true)}>Delete {selected.size || ''}</Button>
          </div>
        </div>
      )}

      {mobile ? (
        <div className="space-y-4">
          {q.isPending && <Card><div className="py-10 text-center text-ink-3">Loading…</div></Card>}
          {!q.isPending && !items.length && <Card><EmptyState title="No revenue" description="Nothing matches this period and filters." /></Card>}
          {groups.map(([d, list]) => (
            <section key={d}>
              <div className="flex items-baseline justify-between px-1 mb-1.5">
                <span className="label">{date(d, 'long')}</span>
                <span className="num text-[12px] text-ink-3">{money(list.reduce((a, b) => a + b.amountMinor, 0))}</span>
              </div>
              <ul className="card divide-y divide-line overflow-hidden">
                {list.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => (selecting ? toggle(r.id) : setDetail(r))} className={clsx('pressable w-full flex items-center gap-3 px-4 py-3 text-left', selected.has(r.id) && 'bg-accent-soft/50')}>
                      {selecting ? (
                        <span className={clsx('size-6 rounded-full border-2 inline-flex items-center justify-center shrink-0', selected.has(r.id) ? 'bg-accent border-accent text-white' : 'border-line-strong')}>{selected.has(r.id) && <CheckSquare className="size-3.5" />}</span>
                      ) : (
                        <span className="inline-flex items-center justify-center size-10 rounded-[12px] shrink-0" style={{ background: `${r.category?.color ?? 'var(--s-revenue)'}1f` }}><Swatch color={r.category?.color ?? 'var(--s-revenue)'} size={10} /></span>
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-medium truncate">{r.description}</span>
                        <span className="block text-[12.5px] text-ink-3 truncate">{r.category?.name ?? 'Uncategorised'}{r.source ? ` · ${r.source}` : ''}{r.receivedBy ? ` · ${r.receivedBy.name}` : ''}</span>
                      </span>
                      <Money minor={r.amountMinor} tone="revenue" className="text-[15px] font-semibold shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {q.data && <div className="card"><Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(n) => p.set({ page: String(n) })} /></div>}
        </div>
      ) : (
        <Card flush>
          <Table>
            <thead>
              <tr>
                {selecting && <Th className="w-10"><Checkbox checked={allSelected} onChange={toggleAll} aria-label="Select all" /></Th>}
                <Th sortable sorted={sorted('date')} onSort={() => sortBy('date')} className="w-28">Date</Th>
                <Th sortable sorted={sorted('description')} onSort={() => sortBy('description')}>Description</Th>
                <Th>Category</Th>
                <Th>Source</Th>
                <Th>Received by</Th>
                {defs.map((d) => <Th key={d.id} align={d.type === 'money' || d.type === 'number' ? 'right' : 'left'}>{d.label}</Th>)}
                <Th align="right" sortable sorted={sorted('amountMinor')} onSort={() => sortBy('amountMinor')} className="w-36">Amount</Th>
                <Th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {q.isPending && <EmptyRow colSpan={8 + defs.length}>Loading…</EmptyRow>}
              {!q.isPending && !items.length && <EmptyRow colSpan={8 + defs.length}>No revenue in this period.</EmptyRow>}
              {items.map((r) => (
                <Tr key={r.id} selected={selected.has(r.id)} className="cursor-pointer" onClick={() => (selecting ? toggle(r.id) : setDetail(r))}>
                  {selecting && <Td onClick={(ev) => ev.stopPropagation()}><Checkbox checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label="Select" /></Td>}
                  <Td className="num text-ink-2 whitespace-nowrap">{date(r.date)}</Td>
                  <Td><div className="font-medium truncate max-w-[380px]">{r.description}</div>{r.recurringRuleId && <div className="text-[12px] text-ink-3">recurring</div>}</Td>
                  <Td>{r.category ? <Chip color={r.category.color}>{r.category.name}</Chip> : <span className="text-ink-4">—</span>}</Td>
                  <Td className="text-ink-2">{r.source ?? <span className="text-ink-4">—</span>}</Td>
                  <Td>{r.receivedBy ? <span className="inline-flex items-center gap-2"><Avatar name={r.receivedBy.name} color={r.receivedBy.color} size={22} />{r.receivedBy.name}</span> : <span className="text-ink-3">Company</span>}</Td>
                  {defs.map((d) => <Td key={d.id} align={d.type === 'money' || d.type === 'number' ? 'right' : 'left'}><CustomCell def={d} value={r.customFields?.[d.key]} /></Td>)}
                  <Td align="right"><Money minor={r.amountMinor} className="font-semibold" /></Td>
                  <Td onClick={(ev) => ev.stopPropagation()}>
                    <Menu trigger={() => <button type="button" className="size-8 inline-flex items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-card-hover" aria-label="Actions"><MoreHorizontal className="size-4" /></button>}>
                      {(close) => (<><MenuItem icon={<Pencil />} onClick={() => { close(); setEditing(r); }}>Edit</MenuItem><MenuSeparator /><MenuItem icon={<Trash2 />} danger onClick={() => { close(); setConfirm(r); }}>Delete</MenuItem></>)}
                    </Menu>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(n) => p.set({ page: String(n) })} />}
        </Card>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.description ?? ''} description={detail ? `${date(detail.date, 'long')} · ${detail.category?.name ?? 'Uncategorised'}` : ''} width={460}
        footer={detail && (<><Button variant="danger" size="md" onClick={() => setConfirm(detail)}>Delete</Button><Button variant="primary" size="md" onClick={() => { setEditing(detail); setDetail(null); }}>Edit</Button></>)}>
        {detail && (
          <div className="space-y-4">
            <div className="num text-[32px] font-semibold tracking-tight text-revenue">{money(detail.amountMinor)}</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px]">
              <dt className="text-ink-3">Received by</dt><dd className="font-medium">{detail.receivedBy?.name ?? 'Company account'}</dd>
              {detail.source && <><dt className="text-ink-3">Source</dt><dd>{detail.source}</dd></>}
              {defs.map((d) => <span key={d.id} className="contents"><dt className="text-ink-3">{d.label}</dt><dd><CustomCell def={d} value={detail.customFields?.[d.key]} /></dd></span>)}
              {detail.notes && <><dt className="text-ink-3">Notes</dt><dd className="whitespace-pre-wrap">{detail.notes}</dd></>}
            </dl>
          </div>
        )}
      </Modal>
      <RevenueForm open={editing !== undefined} onClose={() => setEditing(undefined)} revenue={editing ?? null} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={async () => { try { await remove.mutateAsync(confirm!.id); toast.success('Revenue deleted'); setConfirm(null); setDetail(null); } catch (e) { toast.error('Delete failed', errorMessage(e)); } }} loading={remove.isPending} title="Delete this revenue entry?" description={confirm ? `${confirm.description} · ${money(confirm.amountMinor)} on ${date(confirm.date)}` : ''} />
      <ConfirmDialog open={bulkConfirm} onClose={() => setBulkConfirm(false)} onConfirm={async () => { try { await bulkDelete.mutateAsync([...selected]); toast.success(`${selected.size} entries deleted`); setSelected(new Set()); setSelecting(false); setBulkConfirm(false); } catch (e) { toast.error('Delete failed', errorMessage(e)); } }} loading={bulkDelete.isPending} title={`Delete ${selected.size} entries?`} description="This cannot be undone." />
    </>
  );
}
