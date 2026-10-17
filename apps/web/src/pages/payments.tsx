import { clsx } from 'clsx';
import { Archive, ArchiveRestore, CreditCard, MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { PaymentMethod } from '@ledgr/shared';
import { usePaymentMethodMutations, usePaymentMethods } from '@/lib/queries';
import { PaymentMethodForm } from '@/components/forms/payment-method-form';
import { Button } from '@/components/ui/button';
import { EmptyState, Loading, PageHeader, Card, ListRow } from '@/components/ui/misc';
import { Badge, Swatch, Tile } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { errorMessage, useToast } from '@/components/ui/toast';
import { Checkbox } from '@/components/ui/input';

const SUGGESTIONS = ['Cash', 'Visa', 'Mastercard', 'Bank transfer', 'Instapay', 'Vodafone Cash', 'PayPal', 'Stripe', 'Online payment'];

export function PaymentsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const q = usePaymentMethods(true);
  const { create, update, remove } = usePaymentMethodMutations();
  const toast = useToast();
  const [editing, setEditing] = useState<PaymentMethod | null | undefined>(undefined);
  const [confirm, setConfirm] = useState<PaymentMethod | null>(null);
  const all = q.data?.items ?? [];
  const items = all.filter((m) => showArchived || !m.archived);
  const missing = SUGGESTIONS.filter((s) => !all.some((m) => m.name.toLowerCase() === s.toLowerCase()));

  return (
    <>
      <PageHeader title="Payment methods" subtitle="Cash, cards, online… Each expense and revenue row can hold an amount per method. Shown in tables, analytics and exports." actions={<Button variant="primary" size="sm" className="rounded-full" icon={<Plus className="size-4" />} onClick={() => setEditing(null)}>New method</Button>} />
      <div className="flex items-center justify-end mb-4">
        <Checkbox label="Archived" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" flush>
          {q.isPending ? <Loading /> : !items.length ? <EmptyState icon={<CreditCard />} title="No payment methods yet" description="Add the ways this project gets paid. Pick from the suggestions or create your own." action={<Button variant="soft" onClick={() => setEditing(null)}>Add one</Button>} /> : (
            <ul className="divide-y divide-line">
              {items.map((m) => (
                <li key={m.id} className={clsx('flex items-center', m.archived && 'opacity-60')}>
                  <ListRow
                    className="flex-1"
                    leading={<Tile color={m.color}><Swatch color={m.color} size={12} /></Tile>}
                    title={<span className="inline-flex items-center gap-2">{m.name}{m.isDefault && <Badge tone="accent">default</Badge>}{m.archived && <Badge>archived</Badge>}</span>}
                    onClick={() => setEditing(m)}
                  />
                  <div className="pr-3">
                    <Menu trigger={() => <button type="button" className="size-9 inline-flex items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-card-hover" aria-label="Actions"><MoreHorizontal className="size-4" /></button>}>
                      {(close) => (
                        <>
                          <MenuItem icon={<Pencil />} onClick={() => { close(); setEditing(m); }}>Edit</MenuItem>
                          {!m.archived && <MenuItem icon={<Star />} onClick={async () => { close(); try { await update.mutateAsync({ id: m.id, isDefault: !m.isDefault }); } catch (e) { toast.error('Failed', errorMessage(e)); } }}>{m.isDefault ? 'Remove as default' : 'Make default'}</MenuItem>}
                          <MenuItem icon={m.archived ? <ArchiveRestore /> : <Archive />} onClick={async () => { close(); try { await update.mutateAsync({ id: m.id, archived: !m.archived }); } catch (e) { toast.error('Failed', errorMessage(e)); } }}>{m.archived ? 'Restore' : 'Archive'}</MenuItem>
                          <MenuSeparator />
                          <MenuItem icon={<Trash2 />} danger onClick={() => { close(); setConfirm(m); }}>Delete</MenuItem>
                        </>
                      )}
                    </Menu>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Quick add" subtitle="Common ones, one tap each">
          {missing.length ? (
            <div className="flex flex-wrap gap-2">
              {missing.map((s) => (
                <Button key={s} size="sm" variant="secondary" className="rounded-full" icon={<Plus className="size-3.5" />} loading={create.isPending && create.variables?.name === s} onClick={async () => { try { await create.mutateAsync({ name: s, isDefault: all.length === 0 }); } catch (e) { toast.error('Could not add', errorMessage(e)); } }}>
                  {s}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-[13.5px] text-ink-3">All suggestions are already added.</p>
          )}
        </Card>
      </div>
      <PaymentMethodForm open={editing !== undefined} onClose={() => setEditing(undefined)} method={editing ?? null} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={async () => { try { await remove.mutateAsync(confirm!.id); toast.success('Payment method deleted'); setConfirm(null); } catch (e) { toast.error('Could not delete', errorMessage(e)); } }} loading={remove.isPending} title={`Delete ${confirm?.name}?`} description="Only possible when no revenue uses it. Otherwise archive it instead." />
    </>
  );
}
