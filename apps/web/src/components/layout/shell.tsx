import { clsx } from 'clsx';
import { ArrowLeftRight, BarChart3, CreditCard, Database, LogOut, Menu as MenuIcon, Monitor, Moon, Plus, Repeat, Settings2, Sun, Tags, TrendingDown, TrendingUp, Users, X } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '@/lib/auth';
import { useProject } from '@/lib/project';
import { useTheme, type Theme } from '@/lib/theme';
import { RangePicker } from './range-picker';
import { Segmented } from '@/components/ui/misc';
import { ExpenseForm } from '@/components/forms/expense-form';
import { RevenueForm } from '@/components/forms/revenue-form';
import { SettlementForm } from '@/components/forms/settlement-form';

const NAV = [
  { to: '/', label: 'Overview', icon: BarChart3, end: true, mobile: true },
  { to: '/expenses', label: 'Expenses', icon: TrendingDown, mobile: true },
  { to: '/revenue', label: 'Revenue', icon: TrendingUp, mobile: true },
  { to: '/stakeholders', label: 'Stakeholders', icon: Users, mobile: false },
  { to: '/categories', label: 'Categories', icon: Tags, mobile: false },
  { to: '/payments', label: 'Payment methods', icon: CreditCard, mobile: false },
  { to: '/recurring', label: 'Recurring', icon: Repeat, mobile: false },
  { to: '/data', label: 'Import & export', icon: Database, mobile: false },
  { to: '/settings', label: 'Settings', icon: Settings2, mobile: false },
];

export function Shell() {
  const { project } = useProject();
  const loc = useLocation();
  const current = NAV.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)));
  const [more, setMore] = useState(false);
  const [quick, setQuick] = useState<null | 'expense' | 'revenue' | 'settlement'>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  useEffect(() => setMore(false), [loc.pathname]);

  return (
    <div className="h-full flex bg-bg">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[232px] shrink-0 flex-col border-r border-line bg-card/60">
        <div className="h-16 px-5 flex items-center gap-2.5">
          <Logo />
          <span className="text-[17px] font-semibold tracking-tight">ledgr</span>
        </div>
        <div className="px-5 pb-4">
          <div className="label">Project</div>
          <div className="text-[15px] font-semibold truncate">{project.config.name}</div>
        </div>
        <nav className="flex-1 px-3 space-y-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={{ pathname: n.to, search: loc.search }}
              end={n.end}
              className={({ isActive }) =>
                clsx('group flex items-center gap-3 h-10 px-3 rounded-[12px] text-[14px] font-medium transition-colors', isActive ? 'bg-card text-ink shadow-sm border border-line' : 'text-ink-2 hover:text-ink hover:bg-card-hover border border-transparent')
              }
            >
              {({ isActive }) => (
                <>
                  <n.icon className={clsx('size-[18px]', isActive ? 'text-accent' : 'text-ink-3 group-hover:text-ink-2')} />
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-line">
          <button type="button" onClick={() => { setQuick('expense'); setQuickOpen(true); }} className="pressable w-full h-10 rounded-[12px] bg-primary text-primary-ink font-semibold text-[14px] inline-flex items-center justify-center gap-2">
            <Plus className="size-4" /> Add expense
          </button>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button type="button" onClick={() => { setQuick('revenue'); setQuickOpen(true); }} className="pressable h-9 rounded-[10px] bg-card border border-line text-[13px] font-medium hover:bg-card-hover">Add revenue</button>
            <button type="button" onClick={() => { setQuick('settlement'); setQuickOpen(true); }} className="pressable h-9 rounded-[10px] bg-card border border-line text-[13px] font-medium hover:bg-card-hover">Settle up</button>
          </div>
          <UserBlock />
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-30 bg-bg/90 backdrop-blur border-b border-line" style={{ paddingTop: 'var(--safe-top)' }}>
          <div className="h-14 px-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Logo size={26} />
              <div className="min-w-0 leading-tight">
                <div className="text-[15px] font-semibold truncate">{current?.label ?? 'ledgr'}</div>
                <div className="text-[11.5px] text-ink-3 truncate">{project.config.name}</div>
              </div>
            </div>
            <button type="button" onClick={() => setMore(true)} aria-label="Menu" className="size-10 inline-flex items-center justify-center rounded-full hover:bg-card-hover">
              <MenuIcon className="size-5" />
            </button>
          </div>
          <div className="px-4 pb-2.5">
            <RangePicker />
          </div>
        </header>
        {/* Desktop top bar */}
        <header className="hidden md:flex h-16 shrink-0 px-6 items-center justify-between gap-4">
          <div className="text-[15px] font-semibold text-ink-2">{current?.label}</div>
          <RangePicker />
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-4 md:px-6 py-4 md:pb-8 max-w-[1400px] mx-auto pb-28">
            <Outlet />
          </div>
        </main>

        {/* Mobile bottom tabs */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur border-t border-line safe-bottom">
          <div className="grid grid-cols-5 h-[60px] items-center">
            {NAV.filter((n) => n.mobile).map((n, i) => (
              <Fragment key={n.to}>
                {i === 2 && (
                  <button key="plus" type="button" onClick={() => { setQuick('expense'); setQuickOpen(true); }} aria-label="Add" className="justify-self-center pressable -mt-6 size-14 rounded-full bg-primary text-primary-ink shadow-[var(--shadow-pop)] inline-flex items-center justify-center">
                    <Plus className="size-7" />
                  </button>
                )}
                <NavLink to={{ pathname: n.to, search: loc.search }} end={n.end} className={({ isActive }) => clsx('flex flex-col items-center justify-center gap-0.5 h-full text-[11px] font-medium', isActive ? 'text-ink' : 'text-ink-3')}>
                  {({ isActive }) => (
                    <>
                      <n.icon className={clsx('size-[22px]', isActive && 'text-accent')} />
                      {n.label}
                    </>
                  )}
                </NavLink>
              </Fragment>
            ))}
            <button type="button" onClick={() => setMore(true)} className={clsx('flex flex-col items-center justify-center gap-0.5 h-full text-[11px] font-medium', more || (current && !current.mobile) ? 'text-ink' : 'text-ink-3')}>
              <MenuIcon className={clsx('size-[22px]', current && !current.mobile && 'text-accent')} />
              More
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile "More" drawer */}
      <AnimatePresence>
        {more && (
          <div className="md:hidden fixed inset-0 z-50 flex items-end">
            <motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMore(false)} />
            <motion.div className="relative w-full bg-card rounded-t-[24px] shadow-2xl pb-[max(12px,var(--safe-bottom))]" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 420, damping: 40 }}>
              <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line-strong" />
              <div className="flex items-center justify-between px-5 pt-3 pb-1">
                <div>
                  <div className="text-[17px] font-semibold">{project.config.name}</div>
                  <div className="text-[12.5px] text-ink-3">{project.config.currency} · {project.stats.stakeholders} partners</div>
                </div>
                <button type="button" onClick={() => setMore(false)} aria-label="Close" className="size-9 inline-flex items-center justify-center rounded-full hover:bg-card-hover"><X className="size-5" /></button>
              </div>
              <div className="px-3 py-2 grid grid-cols-2 gap-1.5">
                {NAV.map((n) => (
                  <NavLink key={n.to} to={{ pathname: n.to, search: loc.search }} end={n.end} className={({ isActive }) => clsx('flex items-center gap-3 h-12 px-3 rounded-[12px] text-[14.5px] font-medium', isActive ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:bg-card-hover')}>
                    <n.icon className="size-5 text-ink-3" /> {n.label}
                  </NavLink>
                ))}
              </div>
              <div className="px-5 pt-2"><ThemeSwitch /></div>
              <div className="px-5 pt-3"><UserBlock mobile /></div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <QuickAddSheets kind={quick} open={quickOpen} onClose={() => setQuickOpen(false)} onPick={(k) => { setQuick(k); }} />
    </div>
  );
}

function QuickAddSheets({ kind, open, onClose, onPick }: { kind: null | 'expense' | 'revenue' | 'settlement'; open: boolean; onClose: () => void; onPick: (k: 'expense' | 'revenue' | 'settlement') => void }) {
  return (
    <>
      <ExpenseForm open={open && kind === 'expense'} onClose={onClose} switcher={<KindSwitch value="expense" onChange={onPick} />} />
      <RevenueForm open={open && kind === 'revenue'} onClose={onClose} switcher={<KindSwitch value="revenue" onChange={onPick} />} />
      <SettlementForm open={open && kind === 'settlement'} onClose={onClose} />
    </>
  );
}

export function KindSwitch({ value, onChange }: { value: 'expense' | 'revenue'; onChange: (k: 'expense' | 'revenue' | 'settlement') => void }) {
  return (
    <Segmented
      className="w-full [&>button]:flex-1"
      value={value}
      onChange={(v) => onChange(v)}
      items={[
        { id: 'expense', label: 'Expense' },
        { id: 'revenue', label: 'Revenue' },
      ]}
    />
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span aria-hidden className="inline-flex items-center justify-center rounded-[9px] bg-primary shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size * 0.62} height={size * 0.62}>
        <path d="M20 16h8v24h16v8H20z" fill="var(--primary-ink)" />
        <circle cx="44" cy="22" r="5" fill="#1baf7a" />
      </svg>
    </span>
  );
}

export function ThemeSwitch() {
  const [theme, setTheme] = useTheme();
  return (
    <Segmented<Theme>
      className="w-full [&>button]:flex-1"
      value={theme}
      onChange={setTheme}
      items={[
        { id: 'system', label: <span className="inline-flex items-center gap-1.5"><Monitor className="size-3.5" /> Auto</span> },
        { id: 'light', label: <span className="inline-flex items-center gap-1.5"><Sun className="size-3.5" /> Light</span> },
        { id: 'dark', label: <span className="inline-flex items-center gap-1.5"><Moon className="size-3.5" /> Dark</span> },
      ]}
    />
  );
}

function UserBlock({ mobile }: { mobile?: boolean }) {
  const { user, signOut, mode } = useAuth();
  const navigate = useNavigate();
  return (
    <div className={clsx('flex items-center gap-2.5', mobile ? 'pt-1' : 'mt-3 pt-3 border-t border-line')}>
      <span className="size-8 rounded-full bg-accent-soft text-accent text-[12px] font-semibold inline-flex items-center justify-center">{(user?.email ?? 'l')[0]!.toUpperCase()}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] truncate">{user?.email}</span>
        <span className="block text-[11.5px] text-ink-3">{mode === 'none' ? 'Local, no sign-in' : 'Admin'}</span>
      </span>
      {!mobile && <ThemeMini />}
      {mode === 'supabase' && (
        <button type="button" onClick={() => signOut().then(() => navigate('/'))} aria-label="Sign out" title="Sign out" className="size-8 inline-flex items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-card-hover">
          <LogOut className="size-4" />
        </button>
      )}
    </div>
  );
}

function ThemeMini() {
  const [theme, setTheme, resolved] = useTheme();
  const next: Theme = theme === 'system' ? (resolved === 'dark' ? 'light' : 'dark') : theme === 'dark' ? 'light' : 'system';
  const Icon = theme === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun;
  return (
    <button type="button" onClick={() => setTheme(next)} aria-label="Theme" title={`Theme: ${theme}`} className="size-8 inline-flex items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-card-hover">
      <Icon className="size-4" />
    </button>
  );
}

export const ICONS = { ArrowLeftRight };
