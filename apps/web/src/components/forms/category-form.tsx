import { useEffect, useState } from 'react';
import { CATEGORICAL_PALETTE, type Category, type CategoryKind, type CreateCategoryInput } from '@ledgr/shared';
import { useCategoryMutations } from '@/lib/queries';
import { errorMessage, useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, Toggle } from '@/components/ui/input';
import { MoneyInput } from './money-input';
import { ColorPicker } from './color-picker';

export function CategoryForm({ open, onClose, category, kind }: { open: boolean; onClose: () => void; category?: Category | null; kind: CategoryKind }) {
  const toast = useToast();
  const { create, update } = useCategoryMutations();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(CATEGORICAL_PALETTE[0]);
  const [budget, setBudget] = useState<number | null>(null);
  const [archived, setArchived] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? '');
    setColor(category?.color ?? CATEGORICAL_PALETTE[Math.floor(Math.random() * 7)]);
    setBudget(category?.monthlyBudgetMinor ?? null);
    setArchived(category?.archived ?? false);
  }, [open, category]);
  const valid = name.trim().length > 0;
  const busy = create.isPending || update.isPending;
  const submit = async () => {
    const body: CreateCategoryInput = { name: name.trim(), kind, color, monthlyBudgetMinor: kind === 'expense' ? budget : null, archived };
    try {
      if (category) await update.mutateAsync({ id: category.id, ...body });
      else await create.mutateAsync(body);
      toast.success(category ? 'Category updated' : 'Category added');
      onClose();
    } catch (e) {
      toast.error('Could not save category', errorMessage(e));
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={category ? 'Edit category' : `New ${kind} category`} footer={<><Button variant="ghost" size="md" onClick={onClose}>Cancel</Button><Button variant="primary" size="md" onClick={submit} loading={busy} disabled={!valid}>{category ? 'Save' : 'Add category'}</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) submit(); }}>
        <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <ColorPicker value={color} onChange={setColor} />
        {kind === 'expense' && <Field label="Monthly budget" hint="optional"><MoneyInput value={budget} onChange={setBudget} /></Field>}
        {category && <Toggle checked={!archived} onChange={(v) => setArchived(!v)} label="Active" description={archived ? 'Archived: hidden from forms, history kept' : 'Shown in forms and filters'} />}
      </form>
    </Modal>
  );
}
