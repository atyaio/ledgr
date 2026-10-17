import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ProjectProvider, useProjectQuery } from '@/lib/project';
import { ToastProvider } from '@/components/ui/toast';
import { Loading } from '@/components/ui/misc';
import { Shell } from '@/components/layout/shell';
import { LoginPage } from '@/pages/login';

const Overview = lazy(() => import('@/pages/overview').then((m) => ({ default: m.OverviewPage })));
const Expenses = lazy(() => import('@/pages/expenses').then((m) => ({ default: m.ExpensesPage })));
const Revenue = lazy(() => import('@/pages/revenue').then((m) => ({ default: m.RevenuePage })));
const Stakeholders = lazy(() => import('@/pages/stakeholders').then((m) => ({ default: m.StakeholdersPage })));
const Categories = lazy(() => import('@/pages/categories').then((m) => ({ default: m.CategoriesPage })));
const Recurring = lazy(() => import('@/pages/recurring').then((m) => ({ default: m.RecurringPage })));
const Data = lazy(() => import('@/pages/data').then((m) => ({ default: m.DataPage })));
const Settings = lazy(() => import('@/pages/settings').then((m) => ({ default: m.SettingsPage })));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 10_000 } },
});

function Splash({ children }: { children?: ReactNode }) {
  return (
    <div className="h-full flex items-center justify-center bg-bg">
      <div className="text-center">
        <div className="serif italic text-[34px] leading-none">ledgr</div>
        <div className="mt-3 text-ink-3 text-[12px] num">{children ?? <>booting <span className="blink">▍</span></>}</div>
      </div>
    </div>
  );
}

function Gate() {
  const auth = useAuth();
  if (auth.status === 'loading') return <Splash />;
  if (auth.status === 'error') return <Splash>Cannot reach the ledgr API. {auth.error}</Splash>;
  if (auth.status !== 'ready') return <LoginPage />;
  return <ProjectGate />;
}

function ProjectGate() {
  const q = useProjectQuery();
  if (q.isPending) return <Splash />;
  if (q.isError) return <Splash>Failed to load project: {q.error.message}</Splash>;
  return (
    <ProjectProvider project={q.data}>
      <Outlet />
    </ProjectProvider>
  );
}

const page = (el: ReactNode) => <Suspense fallback={<Loading />}>{el}</Suspense>;

const router = createBrowserRouter([
  {
    element: <Gate />,
    children: [
      {
        element: <Shell />,
        children: [
          { index: true, element: page(<Overview />) },
          { path: 'expenses', element: page(<Expenses />) },
          { path: 'revenue', element: page(<Revenue />) },
          { path: 'stakeholders', element: page(<Stakeholders />) },
          { path: 'categories', element: page(<Categories />) },
          { path: 'recurring', element: page(<Recurring />) },
          { path: 'data', element: page(<Data />) },
          { path: 'settings', element: page(<Settings />) },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
