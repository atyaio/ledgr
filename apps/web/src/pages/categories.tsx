import { clsx } from 'clsx';
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Category, CategoryKind } from '@ledgr/shared';
import { useProject } from '@/lib/project';
import { useBudgets, useCategories, useCategoryMutations } from '@/lib/queries';
import { useDateRange } from '@/lib/range';
import { pct } from '@/lib/format';
import { CategoryForm } from '@/components/forms/category-form';
import { Button } from '@/components/ui/button';
import { EmptyState, Loading, Meter, PageHeader, Panel, Tabs } from '@/components/ui/misc';
import { EmptyRow, Table, Td, Th, Tr } from '@/components/ui/table';
import { Money } from '@/components/ui/money';
import { Badge, Swatch } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { errorMessage, useToast } from '@/components/ui/toast';

export function CategoriesPage() {
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [showArchived, setShowArchived] = useState(false);
  const q = useCategories(kind, true);
  const { update, remove } = useCategoryMutations();
  const toast = useToast();
  const [editing, setEditing] = useState<Category | null | undefined>(undefined);
  const [confirm, setConfirm] = useState<Category | null>(null);
  const items = (q.data?.items ?? []).filter((c) => showArchived || !c.archived);
  const { range } = useDateRange();
  const today = new Date().toISOString().slice(0, 10);
  const budgets = useBudgets((range.to < today ? range.to : today).slice(0, 7));
  const { money } = useProject();

  return (
    <>
      <PageHeader title="Categories" subtitle="Group entries, set monthly budgets on expense categories." actions={<Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing(null)}>New category</Button>} />
      <div className="flex items-center justify-between mb-4">
        <Tabs value={kind} onChange={setKind} items={[{ id: 'expense', label: 'Expense' }, { id: 'revenue', label: 'Revenue' }]} />
        <label className="text-[12px] text-ink-3 inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
      </div>
      <div className="grid grid-cols-12 gap-4">
        <Panel className={clsx('col-span-12', kind === 'expense' && 'xl:col-span-7')}>
          {q.isPending ? <Loading /> : (
            <Table>
              <thead><tr><Th>Name</Th>{kind === 'expense' && <Th align="right">Monthly budget</Th>}<Th>Status</Th><Th className="w-10" /></tr></thead>
              <tbody>
                {!items.length && <EmptyRow colSpan={4}>No {kind} categories.</EmptyRow>}
                {items.map((c) => (
                  <Tr key={c.id} className={clsx(c.archived && 'opacity-60')}>
                    <Td><span className="inline-flex items-center gap-2"><Swatch color={c.color} size={10} /><span className="font-medium">{c.name}</span></span></Td>
                    {kind === 'expense' && <Td align="right">{c.monthlyBudgetMinor ? <Money minor={c.monthlyBudgetMinor} /> : <span className="text-ink-4">—</span>}</Td>}
                    <Td>{c.archived ? <Badge>archived</Badge> : <Badge tone="good">active</Badge>}</Td>
                    <Td>
                      <Menu trigger={() => <button className="size-6 inline-flex items-center justify-center rounded text-ink-3 hover:text-ink hover:bg-hover" aria-label="Actions"><MoreHorizontal className="size-3.5" /></button>}>
                        {(close) => (
                          <>
                            <MenuItem icon={<Pencil />} onClick={() => { close(); setEditing(c); }}>Edit</MenuItem>
                            <MenuItem icon={c.archived ? <ArchiveRestore /> : <Archive />} onClick={async () => { close(); try { await update.mutateAsync({ id: c.id, archived: !c.archived }); } catch (e) { toast.error('Failed', errorMessage(e)); } }}>{c.archived ? 'Restore' : 'Archive'}</MenuItem>
                            <MenuSeparator />
                            <MenuItem icon={<Trash2 />} danger onClick={() => { close(); setConfirm(c); }}>Delete</MenuItem>
                          </>
                        )}
                      </Menu>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
        {kind === 'expense' && (
          <Panel className="col-span-12 xl:col-span-5" title="Budget vs actual" eyebrow={budgets.data?.month ?? ''}>
            {budgets.isPending ? <Loading /> : !budgets.data?.items.length ? <EmptyState title="No budgets yet" description="Edit an expense category and set a monthly budget." /> : (
              <ul className="px-4 py-3 space-y-3">
                {budgets.data.items.map((b) => (
                  <li key={b.categoryId}>
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="inline-flex items-center gap-1.5"><Swatch color={b.color} />{b.name}</span>
                      <span className="num"><span className={b.pct >= 100 ? 'text-critical' : ''}>{money(b.spentMinor)}</span><span className="text-ink-3"> / {money(b.budgetMinor)}</span><span className={clsx('ml-2 text-[10.5px]', b.pct >= 100 ? 'text-critical' : b.pct >= 85 ? 'text-warning' : 'text-ink-3')}>{pct(b.pct, 0)}</span></span>
                    </div>
                    <Meter value={b.pct} />
                    <div className="text-[10.5px] text-ink-3 num mt-1">{b.remainingMinor >= 0 ? `${money(b.remainingMinor)} left` : `${money(-b.remainingMinor)} over`}</div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>
      <CategoryForm open={editing !== undefined} onClose={() => setEditing(undefined)} category={editing ?? null} kind={kind} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={async () => { try { await remove.mutateAsync(confirm!.id); toast.success('Category deleted'); setConfirm(null); } catch (e) { toast.error('Could not delete', errorMessage(e)); } }} loading={remove.isPending} title={`Delete ${confirm?.name}?`} description="Only possible when no entries use it. Otherwise archive it instead." />
    </>
  );
}
