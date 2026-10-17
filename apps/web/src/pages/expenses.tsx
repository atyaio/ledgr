import { clsx } from 'clsx';
import { MoreHorizontal, Pencil, Plus, RefreshCw, Trash2, CheckSquare, Square } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CustomFieldDefinition, Expense, MethodPayment, PaymentMethod } from '@ledgr/shared';
import { PaymentAmountPopup, type PaymentTarget } from '@/components/forms/payment-amount-popup';
import { useDateRange } from '@/lib/range';
import { useProject } from '@/lib/project';
import { useCategories, useCustomFields, useExpenseMutations, useExpenses, usePaymentMethods, useStakeholders } from '@/lib/queries';
import { downloadFile } from '@/lib/api';
import { useIsMobile } from '@/lib/media';
import { useI18n } from '@/i18n';
import { LedgerToolbar, useLedgerParams } from '@/components/ledger-toolbar';
import { ExpenseForm } from '@/components/forms/expense-form';
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

export function ExpensesPage() {
  const { t, name, label } = useI18n();
  const payName = (p: MethodPayment) => name({ name: p.name ?? '', nameAr: p.nameAr });
  const { range } = useDateRange();
  const { date, money } = useProject();
  const p = useLedgerParams();
  const toast = useToast();
  const mobile = useIsMobile();
  const cats = useCategories('expense', true);
  const sh = useStakeholders();
  const cf = useCustomFields('expense');
  const pm = usePaymentMethods(true);
  const methods: PaymentMethod[] = useMemo(() => (pm.data?.items ?? []).filter((m) => !m.archived), [pm.data]);
  const [payTarget, setPayTarget] = useState<PaymentTarget | null>(null);
  const params = useMemo(
    () => ({ from: range.from, to: range.to, q: p.q, categoryId: p.categoryId, stakeholderId: p.stakeholderId, paymentMethodId: p.paymentMethodId, sort: p.sort, order: p.order, page: p.page, pageSize: PAGE }),
    [range, p.q, p.categoryId, p.stakeholderId, p.paymentMethodId, p.sort, p.order, p.page],
  );
  const q = useExpenses(params);
  const { remove, bulkDelete, recompute, recomputeRange } = useExpenseMutations();
  const [editing, setEditing] = useState<Expense | null | undefined>(undefined);
  const [confirm, setConfirm] = useState<Expense | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [detail, setDetail] = useState<Expense | null>(null);

  const items = q.data?.items ?? [];
  const defs: CustomFieldDefinition[] = cf.data?.items ?? [];
  const allSelected = items.length > 0 && items.every((e) => selected.has(e.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map((e) => e.id)));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const sortBy = (key: string) => p.set({ sort: key, order: p.sort === key && p.order === 'desc' ? 'asc' : 'desc' });
  const sorted = (key: string) => (p.sort === key ? p.order : null);

  const onDelete = async () => {
    if (!confirm) return;
    try { await remove.mutateAsync(confirm.id); toast.success(t('Expense deleted')); setConfirm(null); setDetail(null); } catch (e) { toast.error(t('Delete failed'), errorMessage(e)); }
  };
  const onBulkDelete = async () => {
    try { await bulkDelete.mutateAsync([...selected]); toast.success(t('{n} expenses deleted', { n: selected.size })); setSelected(new Set()); setSelecting(false); setBulkConfirm(false); } catch (e) { toast.error(t('Delete failed'), errorMessage(e)); }
  };
  const onRecompute = async (e: Expense) => { try { await recompute.mutateAsync(e.id); toast.success(t('Split recomputed')); } catch (err) { toast.error(t('Recompute failed'), errorMessage(err)); } };
  const exportCsv = (format: 'xlsx' | 'csv' = 'xlsx') => downloadFile(`/export/expenses.${format}`, `expenses.${format}`, { from: range.from, to: range.to }).catch((e) => toast.error(t('Export failed'), errorMessage(e)));

  // Group by date for the mobile list
  const groups = useMemo(() => {
    const m = new Map<string, Expense[]>();
    for (const e of items) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return [...m.entries()];
  }, [items]);

  return (
    <>
      <PageHeader
        title={t('Expenses')}
        subtitle={q.data ? <><Money minor={q.data.totals.amountMinor} className="text-ink font-medium" /> {t('across {n} entries', { n: q.data.totals.count })}</> : t('Loading…')}
        actions={
          <>
            <Menu trigger={() => <Button variant="secondary" size="sm" icon={<MoreHorizontal className="size-4" />} className="rounded-full">{t('More')}</Button>} title={t('Expenses')}>
              {(close) => (
                <>
                  <MenuItem icon={selecting ? <CheckSquare /> : <Square />} onClick={() => { close(); setSelecting((s) => !s); setSelected(new Set()); }}>{selecting ? t('Done selecting') : t('Select entries')}</MenuItem>
                  <MenuItem icon={<RefreshCw />} onClick={async () => { close(); try { const r = await recomputeRange.mutateAsync({ from: range.from, to: range.to }); toast.success(t('Re-split {n} ownership-mode expenses', { n: r.updated })); } catch (e) { toast.error(t('Recompute failed'), errorMessage(e)); } }}>{t('Re-split range by current ownership')}</MenuItem>
                  <MenuSeparator />
                  <MenuItem icon={<Trash2 />} danger disabled={!selected.size} onClick={() => { close(); setBulkConfirm(true); }}>{t('Delete {n} selected', { n: selected.size || '' })}</MenuItem>
                </>
              )}
            </Menu>
            <Button variant="primary" size="sm" className="rounded-full max-md:hidden" icon={<Plus className="size-4" />} onClick={() => setEditing(null)}>{t('New expense')}</Button>
          </>
        }
      />
      <div className="mb-3">
        <LedgerToolbar categories={cats.data?.items.filter((c) => !c.archived) ?? []} stakeholders={sh.data?.items ?? []} paymentMethods={methods} stakeholderLabel="Paid by" onExport={exportCsv} />
      </div>
      {selecting && items.length > 0 && (
        <div className="mb-3 flex items-center justify-between gap-2 card px-4 py-2 fade-up">
          <Checkbox label={allSelected ? t('Deselect all on page') : t('Select all on page')} checked={allSelected} onChange={toggleAll} />
          <div className="flex items-center gap-2">
            <Button size="xs" variant="ghost" onClick={() => { setSelecting(false); setSelected(new Set()); }}>{t('Done')}</Button>
            <Button size="xs" variant="danger" disabled={!selected.size} icon={<Trash2 className="size-3.5" />} onClick={() => setBulkConfirm(true)}>{t('Delete {n}', { n: selected.size || '' })}</Button>
          </div>
        </div>
      )}

      {mobile ? (
        <div className="space-y-4">
          {q.isPending && <Card><div className="py-10 text-center text-ink-3">{t('Loading…')}</div></Card>}
          {!q.isPending && !items.length && <Card><EmptyState title={t('No expenses')} description={t('Nothing matches this period and filters.')} /></Card>}
          {groups.map(([d, list]) => (
            <section key={d}>
              <div className="flex items-baseline justify-between px-1 mb-1.5">
                <span className="label">{date(d, 'long')}</span>
                <span className="num text-[12px] text-ink-3">{money(list.reduce((a, b) => a + b.amountMinor, 0))}</span>
              </div>
              <ul className="card divide-y divide-line overflow-hidden">
                {list.map((e) => (
                  <li key={e.id}>
                    <button type="button" onClick={() => (selecting ? toggle(e.id) : setDetail(e))} className={clsx('pressable w-full flex items-center gap-3 px-4 py-3 text-start', selected.has(e.id) && 'bg-accent-soft/50')}>
                      {selecting ? (
                        <span className={clsx('size-6 rounded-full border-2 inline-flex items-center justify-center shrink-0', selected.has(e.id) ? 'bg-accent border-accent text-white' : 'border-line-strong')}>{selected.has(e.id) && <CheckSquare className="size-3.5" />}</span>
                      ) : (
                        <span className="inline-flex items-center justify-center size-10 rounded-[12px] shrink-0" style={{ background: `${e.category?.color ?? '#999'}1f` }}><Swatch color={e.category?.color ?? '#999'} size={10} /></span>
                      )}
                      <span className="flex-1 min-w-0">
                        <span dir="auto" className="block text-[15px] font-medium truncate">{e.description}</span>
                        <span className="block text-[12.5px] text-ink-3 truncate">{e.category ? name(e.category) : ''}{e.payments.filter((p) => p.amountMinor > 0).length > 1 ? ` · ${e.payments.filter((p) => p.amountMinor > 0).map((p) => `${payName(p)} ${money(p.amountMinor, { compact: true })}`).join(' + ')}` : e.payments[0] ? ` · ${payName(e.payments[0])}` : ''}{e.paidBy ? ` · ${name(e.paidBy)}` : ` · ${t('Company')}`}{e.splitMode === 'custom' ? ` · ${t('custom split')}` : ''}</span>
                      </span>
                      <Money minor={e.amountMinor} className="text-[15px] font-semibold shrink-0" />
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
                {selecting && <Th className="w-10"><Checkbox checked={allSelected} onChange={toggleAll} aria-label={t('Select all')} /></Th>}
                <Th sortable sorted={sorted('date')} onSort={() => sortBy('date')} className="w-28">{t('Date')}</Th>
                <Th sortable sorted={sorted('description')} onSort={() => sortBy('description')}>{t('Description')}</Th>
                <Th>{t('Category')}</Th>
                <Th>{t('Paid by')}</Th>
                {defs.map((d) => <Th key={d.id} align={d.type === 'money' || d.type === 'number' ? 'right' : 'left'}>{label(d)}</Th>)}
                {methods.map((m) => <Th key={m.id} align="right"><span className="inline-flex items-center gap-1.5"><Swatch color={m.color} />{name(m)}</span></Th>)}
                <Th align="right" sortable sorted={sorted('amountMinor')} onSort={() => sortBy('amountMinor')} className="w-36">{methods.length ? t('Total') : t('Amount')}</Th>
                <Th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {q.isPending && <EmptyRow colSpan={8 + defs.length + methods.length}>{t('Loading…')}</EmptyRow>}
              {!q.isPending && !items.length && <EmptyRow colSpan={8 + defs.length + methods.length}>{t('No expenses match. Try a wider period or clear filters.')}</EmptyRow>}
              {items.map((e) => (
                <Tr key={e.id} selected={selected.has(e.id)} className="cursor-pointer" onClick={() => (selecting ? toggle(e.id) : setDetail(e))}>
                  {selecting && <Td onClick={(ev) => ev.stopPropagation()}><Checkbox checked={selected.has(e.id)} onChange={() => toggle(e.id)} aria-label={t('Select')} /></Td>}
                  <Td className="num text-ink-2 whitespace-nowrap">{date(e.date)}</Td>
                  <Td>
                    <div dir="auto" className="font-medium truncate max-w-[380px]">{e.description}</div>
                    {(e.vendor || e.recurringRuleId || e.splitMode === 'custom') && <div className="text-[12px] text-ink-3 truncate">{[e.vendor, e.recurringRuleId && t('recurring'), e.splitMode === 'custom' && t('custom split')].filter(Boolean).join(' · ')}</div>}
                  </Td>
                  <Td>{e.category && <Chip color={e.category.color}>{name(e.category)}</Chip>}</Td>
                  <Td>{e.paidBy ? <span className="inline-flex items-center gap-2"><Avatar name={name(e.paidBy)} color={e.paidBy.color} size={22} /><span className="truncate">{name(e.paidBy)}</span></span> : <span className="text-ink-3">{t('Company')}</span>}</Td>
                  {defs.map((d) => <Td key={d.id} align={d.type === 'money' || d.type === 'number' ? 'right' : 'left'}><CustomCell def={d} value={e.customFields?.[d.key]} /></Td>)}
                  {methods.map((m) => {
                    const pay = e.payments.find((x) => x.paymentMethodId === m.id);
                    return (
                      <Td key={m.id} align="right" onClick={(ev) => ev.stopPropagation()}>
                        {pay && pay.amountMinor > 0 ? (
                          <button type="button" className="num hover:text-accent" title={t('Edit {method} amount', { method: name(m) })} onClick={() => setPayTarget({ kind: 'expense', entry: e, method: m })}>{money(pay.amountMinor)}</button>
                        ) : (
                          <button type="button" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-accent/80 hover:text-accent whitespace-nowrap" onClick={() => setPayTarget({ kind: 'expense', entry: e, method: m })}><Plus className="size-3.5" />{t('Add {method}', { method: name(m) })}</button>
                        )}
                      </Td>
                    );
                  })}
                  <Td align="right"><Money minor={e.amountMinor} className="font-semibold" /></Td>
                  <Td onClick={(ev) => ev.stopPropagation()}>
                    <Menu trigger={() => <button type="button" className="size-8 inline-flex items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-card-hover" aria-label={t('Actions')}><MoreHorizontal className="size-4" /></button>}>
                      {(close) => (
                        <>
                          <MenuItem icon={<Pencil />} onClick={() => { close(); setEditing(e); }}>{t('Edit')}</MenuItem>
                          <MenuItem icon={<RefreshCw />} onClick={() => { close(); onRecompute(e); }}>{t('Re-split by current ownership')}</MenuItem>
                          <MenuSeparator />
                          <MenuItem icon={<Trash2 />} danger onClick={() => { close(); setConfirm(e); }}>{t('Delete')}</MenuItem>
                        </>
                      )}
                    </Menu>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(n) => p.set({ page: String(n) })} />}
        </Card>
      )}

      <ExpenseDetail expense={detail} onClose={() => setDetail(null)} onEdit={() => { setEditing(detail); setDetail(null); }} onDelete={() => setConfirm(detail)} onRecompute={() => detail && onRecompute(detail)} defs={defs} />
      <ExpenseForm open={editing !== undefined} onClose={() => setEditing(undefined)} expense={editing ?? null} />
      <PaymentAmountPopup target={payTarget} onClose={() => setPayTarget(null)} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={onDelete} loading={remove.isPending} title={t('Delete this expense?')} description={confirm ? t('{description} · {amount} on {date}.', { description: confirm.description, amount: money(confirm.amountMinor), date: date(confirm.date) }) : ''} />
      <ConfirmDialog open={bulkConfirm} onClose={() => setBulkConfirm(false)} onConfirm={onBulkDelete} loading={bulkDelete.isPending} title={t('Delete {n} expenses?', { n: selected.size })} description={t('This cannot be undone. Export first if you want a copy.')} />
    </>
  );
}

function ExpenseDetail({ expense, onClose, onEdit, onDelete, onRecompute, defs }: { expense: Expense | null; onClose: () => void; onEdit: () => void; onDelete: () => void; onRecompute: () => void; defs: CustomFieldDefinition[] }) {
  const { t, name, label } = useI18n();
  const payName = (p: MethodPayment) => name({ name: p.name ?? '', nameAr: p.nameAr });
  const { money, date } = useProject();
  const e = expense;
  return (
    <Modal open={!!e} onClose={onClose} title={e?.description ?? ''} description={e ? `${date(e.date, 'long')} · ${e.category ? name(e.category) : ''}` : ''} width={480}
      footer={e && (
        <>
          <Button variant="ghost" size="md" onClick={() => { onRecompute(); }}>{t('Re-split')}</Button>
          <Button variant="danger" size="md" onClick={() => { onDelete(); }}>{t('Delete')}</Button>
          <Button variant="primary" size="md" onClick={onEdit}>{t('Edit')}</Button>
        </>
      )}>
      {e && (
        <div className="space-y-4">
          <div className="num text-[32px] font-semibold tracking-tight">{money(e.amountMinor)}</div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px]">
            {e.payments.filter((p) => p.amountMinor > 0).map((p) => <span key={p.paymentMethodId} className="contents"><dt className="text-ink-3">{payName(p)}</dt><dd className="num">{money(p.amountMinor)}</dd></span>)}
            <dt className="text-ink-3">{t('Paid by')}</dt><dd className="font-medium">{e.paidBy ? name(e.paidBy) : t('Company account')}</dd>
            {e.vendor && <><dt className="text-ink-3">{t('Vendor')}</dt><dd>{e.vendor}</dd></>}
            {defs.map((d) => <span key={d.id} className="contents"><dt className="text-ink-3">{label(d)}</dt><dd><CustomCell def={d} value={e.customFields?.[d.key]} /></dd></span>)}
            {e.notes && <><dt className="text-ink-3">{t('Notes')}</dt><dd className="whitespace-pre-wrap">{e.notes}</dd></>}
          </dl>
          <div>
            <div className="label mb-2">{e.splitMode === 'custom' ? t('Split (custom)') : t('Split (by ownership)')}</div>
            <ul className="rounded-[14px] border border-line divide-y divide-line">
              {e.splits.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-3.5 h-11 text-[14px]"><span>{s.stakeholderName ?? s.stakeholderId} <span className="num text-ink-3 text-[12.5px]">{s.sharePercent.toFixed(s.sharePercent % 1 ? 2 : 0)}%</span></span><span className="num font-medium">{money(s.amountMinor)}</span></li>
              ))}
              {!e.splits.length && <li className="px-3.5 py-3 text-[13px] text-ink-3">{t('No stakeholders at the time of entry.')}</li>}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}
