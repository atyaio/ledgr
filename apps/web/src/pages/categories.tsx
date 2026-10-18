import { clsx } from 'clsx';
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Category, CategoryKind } from '@atyaio/ledgr-shared';
import { useProject } from '@/lib/project';
import { useBudgets, useCategories, useCategoryMutations } from '@/lib/queries';
import { useDateRange } from '@/lib/range';
import { pct } from '@/lib/format';
import { CategoryForm } from '@/components/forms/category-form';
import { Button } from '@/components/ui/button';
import { EmptyState, Loading, Meter, PageHeader, Card, Tabs, ListRow } from '@/components/ui/misc';
import { Money } from '@/components/ui/money';
import { Badge, Swatch, Tile } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { errorMessage, useToast } from '@/components/ui/toast';
import { Checkbox } from '@/components/ui/input';
import { useI18n } from '@/i18n';

export function CategoriesPage() {
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [showArchived, setShowArchived] = useState(false);
  const q = useCategories(kind, true);
  const { update, remove } = useCategoryMutations();
  const toast = useToast();
  const { t, name } = useI18n();
  const [editing, setEditing] = useState<Category | null | undefined>(undefined);
  const [confirm, setConfirm] = useState<Category | null>(null);
  const items = (q.data?.items ?? []).filter((c) => showArchived || !c.archived);
  const { range } = useDateRange();
  const today = new Date().toISOString().slice(0, 10);
  const budgets = useBudgets((range.to < today ? range.to : today).slice(0, 7));
  const { money } = useProject();

  return (
    <>
      <PageHeader title={t('Categories')} subtitle={t('Group entries and set monthly budgets on expenses.')} actions={<Button variant="primary" size="sm" className="rounded-full" icon={<Plus className="size-4" />} onClick={() => setEditing(null)}>{t('New category')}</Button>} />
      <div className="flex items-center justify-between gap-3 mb-4">
        <Tabs value={kind} onChange={setKind} items={[{ id: 'expense', label: t('Expense') }, { id: 'revenue', label: t('Revenue') }]} className="md:w-auto" />
        <Checkbox label={t('Archived')} checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="shrink-0" />
      </div>
      <div className={clsx('grid grid-cols-1 gap-4', kind === 'expense' && 'xl:grid-cols-3')}>
        <Card className={clsx(kind === 'expense' && 'xl:col-span-2')} flush>
          {q.isPending ? <Loading /> : !items.length ? <EmptyState title={t(kind === 'expense' ? 'No expense categories' : 'No revenue categories')} action={<Button variant="soft" onClick={() => setEditing(null)}>{t('Add one')}</Button>} /> : (
            <ul className="divide-y divide-line">
              {items.map((c) => (
                <li key={c.id} className={clsx('flex items-center', c.archived && 'opacity-60')}>
                  <ListRow
                    className="flex-1"
                    leading={<Tile color={c.color}><Swatch color={c.color} size={12} /></Tile>}
                    title={<span className="inline-flex items-center gap-2">{name(c)}{c.isDefault && <Badge tone="accent">{t('default')}</Badge>}{c.archived && <Badge>{t('archived')}</Badge>}</span>}
                    subtitle={kind === 'expense' ? (c.monthlyBudgetMinor ? t('Budget {amount} / month', { amount: money(c.monthlyBudgetMinor) }) : t('No budget')) : undefined}
                    onClick={() => setEditing(c)}
                  />
                  <div className="pe-3">
                    <Menu trigger={() => <button type="button" className="size-9 inline-flex items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-card-hover" aria-label={t('Actions')}><MoreHorizontal className="size-4" /></button>}>
                      {(close) => (
                        <>
                          <MenuItem icon={<Pencil />} onClick={() => { close(); setEditing(c); }}>{t('Edit')}</MenuItem>
                          {!c.archived && <MenuItem icon={<Star />} onClick={async () => { close(); try { await update.mutateAsync({ id: c.id, isDefault: !c.isDefault }); } catch (e) { toast.error(t('Failed'), errorMessage(e)); } }}>{t(c.isDefault ? 'Remove as default' : 'Make default')}</MenuItem>}
                          <MenuItem icon={c.archived ? <ArchiveRestore /> : <Archive />} onClick={async () => { close(); try { await update.mutateAsync({ id: c.id, archived: !c.archived }); } catch (e) { toast.error(t('Failed'), errorMessage(e)); } }}>{t(c.archived ? 'Restore' : 'Archive')}</MenuItem>
                          <MenuSeparator />
                          <MenuItem icon={<Trash2 />} danger onClick={() => { close(); setConfirm(c); }}>{t('Delete')}</MenuItem>
                        </>
                      )}
                    </Menu>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {kind === 'expense' && (
          <Card title={t('Budgets this month')} subtitle={budgets.data?.month}>
            {budgets.isPending ? <Loading /> : !budgets.data?.items.length ? <EmptyState title={t('No budgets yet')} description={t('Edit an expense category and set a monthly budget.')} /> : (
              <ul className="space-y-4">
                {budgets.data.items.map((b) => (
                  <li key={b.categoryId}>
                    <div className="flex items-center justify-between text-[13.5px] mb-1.5">
                      <span className="inline-flex items-center gap-2"><Swatch color={b.color} size={9} />{name(q.data?.items.find((c) => c.id === b.categoryId) ?? b)}</span>
                      <span className="num"><span className={clsx('font-medium', b.pct >= 100 && 'text-critical')}>{money(b.spentMinor, { compact: true })}</span><span className="text-ink-3"> / {money(b.budgetMinor, { compact: true })}</span></span>
                    </div>
                    <Meter value={b.pct} />
                    <div className={clsx('text-[12px] mt-1', b.pct >= 100 ? 'text-critical' : b.pct >= 85 ? 'text-warning' : 'text-ink-3')}>{t('{pct} used', { pct: pct(b.pct, 0) })} · {b.remainingMinor >= 0 ? t('{amount} left', { amount: money(b.remainingMinor) }) : t('{amount} over', { amount: money(-b.remainingMinor) })}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
      <CategoryForm open={editing !== undefined} onClose={() => setEditing(undefined)} category={editing ?? null} kind={kind} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={async () => { try { await remove.mutateAsync(confirm!.id); toast.success(t('Category deleted')); setConfirm(null); } catch (e) { toast.error(t('Could not delete'), errorMessage(e)); } }} loading={remove.isPending} title={t('Delete {name}?', { name: name(confirm) })} description={t('Only possible when no entries use it. Otherwise archive it instead.')} />
    </>
  );
}
