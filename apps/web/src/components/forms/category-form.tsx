import { useEffect, useState } from 'react';
import { CATEGORICAL_PALETTE, type Category, type CategoryKind, type CreateCategoryInput } from '@atyaio/ledgr-shared';
import { useCategoryMutations } from '@/lib/queries';
import { useI18n } from '@/i18n';
import { errorMessage, useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, Toggle } from '@/components/ui/input';
import { MoneyInput } from './money-input';
import { ColorPicker } from './color-picker';

export function CategoryForm({ open, onClose, category, kind }: { open: boolean; onClose: () => void; category?: Category | null; kind: CategoryKind }) {
  const toast = useToast();
  const { t } = useI18n();
  const { create, update } = useCategoryMutations();
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [color, setColor] = useState<string>(CATEGORICAL_PALETTE[0]);
  const [budget, setBudget] = useState<number | null>(null);
  const [archived, setArchived] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? '');
    setNameAr(category?.nameAr ?? '');
    setColor(category?.color ?? CATEGORICAL_PALETTE[Math.floor(Math.random() * 7)]);
    setBudget(category?.monthlyBudgetMinor ?? null);
    setArchived(category?.archived ?? false);
    setIsDefault(category?.isDefault ?? false);
  }, [open, category]);
  const valid = name.trim().length > 0;
  const busy = create.isPending || update.isPending;
  const submit = async () => {
    const body: CreateCategoryInput = { name: name.trim(), nameAr: nameAr.trim() || null, kind, color, monthlyBudgetMinor: kind === 'expense' ? budget : null, archived, isDefault };
    try {
      if (category) await update.mutateAsync({ id: category.id, ...body });
      else await create.mutateAsync(body);
      toast.success(t(category ? 'Category updated' : 'Category added'));
      onClose();
    } catch (e) {
      toast.error(t('Could not save category'), errorMessage(e));
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={t(category ? 'Edit category' : kind === 'expense' ? 'New expense category' : 'New revenue category')} footer={<><Button variant="ghost" size="md" onClick={onClose}>{t('Cancel')}</Button><Button variant="primary" size="md" onClick={submit} loading={busy} disabled={!valid}>{t(category ? 'Save' : 'Add category')}</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) submit(); }}>
        <Field label={t('Name')} required><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label={t('Arabic name')} hint={t('optional')}><Input lang="ar" dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="يُستخدم الاسم الإنجليزي إذا تُرك فارغًا" /></Field>
        <ColorPicker value={color} onChange={setColor} />
        {kind === 'expense' && <Field label={t('Monthly budget')} hint={t('optional')}><MoneyInput value={budget} onChange={setBudget} /></Field>}
        <Toggle checked={isDefault} onChange={setIsDefault} label={t('Default for new entries')} description={t(kind === 'expense' ? 'Preselected when adding an expense. Only one expense category can be the default.' : 'Preselected when adding revenue. Only one revenue category can be the default.')} />
        {category && <Toggle checked={!archived} onChange={(v) => setArchived(!v)} label={t('Active')} description={t(archived ? 'Archived: hidden from forms, history kept' : 'Shown in forms and filters')} />}
      </form>
    </Modal>
  );
}
