import { Check, ChevronLeft, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ExpenseForm } from '@/components/forms/expense-form';
import { RevenueForm } from '@/components/forms/revenue-form';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/layout/shell';

/**
 * /add/expense and /add/revenue — opened from a home-screen shortcut or widget-like
 * bookmark. Shows the form immediately; after saving, offers "add another" or the
 * dashboard. Lives outside the shell so it feels like a single-purpose app.
 */
export function QuickAddPage() {
  const { kind } = useParams<{ kind: string }>();
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState(0);
  const k = kind === 'revenue' ? 'revenue' : 'expense';
  const onClose = () => setOpen(false);
  const onSaved = () => {
    setSaved((n) => n + 1);
    setOpen(false);
  };

  return (
    <div className="min-h-full bg-bg flex flex-col" style={{ paddingTop: 'var(--safe-top)' }}>
      <header className="h-14 px-4 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-2 hover:text-ink">
          <ChevronLeft className="size-5" /> Dashboard
        </Link>
        <Logo size={28} />
      </header>
      <main className="flex-1 flex items-center justify-center p-6">
        {!open && (
          <div className="text-center fade-up max-w-xs">
            {saved > 0 ? (
              <>
                <span className="mx-auto mb-4 size-16 rounded-full bg-good/10 text-good inline-flex items-center justify-center"><Check className="size-8" /></span>
                <h1 className="text-[22px] font-semibold tracking-tight">{k === 'expense' ? 'Expense' : 'Revenue'} added</h1>
                <p className="text-[14px] text-ink-3 mt-1">{saved} saved this session.</p>
              </>
            ) : (
              <>
                <h1 className="text-[22px] font-semibold tracking-tight">Nothing added</h1>
                <p className="text-[14px] text-ink-3 mt-1">You closed the form without saving.</p>
              </>
            )}
            <div className="mt-6 flex flex-col gap-2">
              <Button variant="primary" size="lg" icon={<Plus className="size-5" />} onClick={() => setOpen(true)}>
                Add another {k}
              </Button>
              <Button variant="ghost" size="md" onClick={() => navigate(`/${k === 'expense' ? 'expenses' : 'revenue'}`)}>
                Open the {k === 'expense' ? 'expenses' : 'revenue'} list
              </Button>
            </div>
          </div>
        )}
      </main>
      {k === 'expense' ? <ExpenseForm open={open} onClose={onClose} onSaved={onSaved} /> : <RevenueForm open={open} onClose={onClose} onSaved={onSaved} />}
    </div>
  );
}
