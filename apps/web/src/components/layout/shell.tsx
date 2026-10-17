import { clsx } from 'clsx';
import {
  ArrowLeftRight,
  BarChart3,
  Database,
  LayoutGrid,
  LogOut,
  Moon,
  Repeat,
  Settings2,
  Sun,
  Tags,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '@/lib/auth';
import { useProject } from '@/lib/project';
import { useTheme } from '@/lib/theme';
import { RangePicker } from './range-picker';

const NAV = [
  { to: '/', label: 'Overview', icon: BarChart3, end: true },
  { to: '/expenses', label: 'Expenses', icon: TrendingDown },
  { to: '/revenue', label: 'Revenue', icon: TrendingUp },
  { to: '/stakeholders', label: 'Stakeholders', icon: Users },
  { to: '/categories', label: 'Categories', icon: Tags },
  { to: '/recurring', label: 'Recurring', icon: Repeat },
  { to: '/data', label: 'Import / Export', icon: Database },
  { to: '/settings', label: 'Settings', icon: Settings2 },
];

export function Shell() {
  const { project, currency } = useProject();
  const { user, signOut, mode } = useAuth();
  const [theme, toggleTheme] = useTheme();
  const loc = useLocation();
  const current = NAV.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)));

  return (
    <div className="h-full flex bg-bg">
      <aside className="w-[216px] shrink-0 border-r border-line bg-panel flex flex-col">
        <div className="h-12 px-4 flex items-center gap-2 border-b border-line">
          <span className="serif italic text-[22px] leading-none tracking-tight text-ink">ledgr</span>
          <span className="eyebrow mt-1">v{project.version}</span>
        </div>
        <div className="px-4 py-3 border-b border-line">
          <div className="eyebrow">Project</div>
          <div className="text-[13.5px] font-semibold tracking-tight truncate mt-0.5">{project.config.name}</div>
          <div className="num text-[11px] text-ink-3 mt-0.5">
            {currency} · {project.stats.stakeholders} partners
          </div>
        </div>
        <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={{ pathname: n.to, search: loc.search }}
              end={n.end}
              className={({ isActive }) =>
                clsx(
                  'group flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[12.5px] font-medium transition-colors relative',
                  isActive ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:text-ink hover:bg-hover',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={clsx('absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent transition-opacity', isActive ? 'opacity-100' : 'opacity-0')} />
                  <n.icon className={clsx('size-4', isActive ? 'text-accent' : 'text-ink-3 group-hover:text-ink-2')} />
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-2 space-y-1">
          <button onClick={toggleTheme} className="w-full flex items-center gap-2.5 h-8 px-2.5 rounded-md text-[12.5px] text-ink-2 hover:text-ink hover:bg-hover">
            {theme === 'dark' ? <Sun className="size-4 text-ink-3" /> : <Moon className="size-4 text-ink-3" />}
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
          <div className="flex items-center gap-2.5 h-9 px-2.5 rounded-md">
            <span className="size-5 rounded-full bg-accent-soft border border-accent/30 text-accent text-[10px] font-semibold inline-flex items-center justify-center">
              {(user?.email ?? 'l')[0]!.toUpperCase()}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[12px] truncate text-ink">{user?.email}</span>
              <span className="block eyebrow !text-[9.5px]">{mode === 'none' ? 'local · no auth' : 'admin'}</span>
            </span>
            {mode === 'supabase' && (
              <button onClick={signOut} aria-label="Sign out" title="Sign out" className="text-ink-3 hover:text-ink">
                <LogOut className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-12 shrink-0 border-b border-line bg-panel/60 backdrop-blur px-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            {current && <current.icon className="size-4 text-ink-3" />}
            <span className="text-[13px] font-medium truncate">{current?.label ?? 'ledgr'}</span>
          </div>
          <RangePicker />
        </header>
        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-5 py-5 max-w-[1500px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export const ICONS = { LayoutGrid, ArrowLeftRight };
