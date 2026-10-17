import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatMoney, minorToMajor, majorToMinor, minorUnitDigits, type ProjectResponse, type FormatMoneyOptions } from '@ledgr/shared';
import { api } from './api';

export interface ProjectState {
  project: ProjectResponse;
  currency: string;
  locale: string;
  weekStartsOn: number;
  fiscalYearStartMonth: number;
  money: (minor: number, opts?: FormatMoneyOptions) => string;
  toMajor: (minor: number) => number;
  toMinor: (major: number) => number;
  digits: number;
  date: (iso: string, style?: 'short' | 'medium' | 'long') => string;
}

const Ctx = createContext<ProjectState | null>(null);

export function useProjectQuery() {
  return useQuery({ queryKey: ['project'], queryFn: () => api.get<ProjectResponse>('/project'), staleTime: 60_000 });
}

export function ProjectProvider({ project, children }: { project: ProjectResponse; children: ReactNode }) {
  const value = useMemo<ProjectState>(() => {
    const { currency, locale, weekStartsOn, fiscalYearStartMonth } = project.config;
    const dateFmt = {
      short: new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', timeZone: 'UTC' }),
      medium: new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }),
      long: new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }),
    };
    return {
      project,
      currency,
      locale,
      weekStartsOn,
      fiscalYearStartMonth,
      digits: minorUnitDigits(currency),
      money: (minor, opts) => formatMoney(minor, currency, { locale, ...opts }),
      toMajor: (minor) => minorToMajor(minor, currency),
      toMinor: (major) => majorToMinor(major, currency),
      date: (iso, style = 'medium') => {
        if (!iso) return '';
        const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
        return Number.isNaN(d.getTime()) ? iso : dateFmt[style].format(d);
      },
    };
  }, [project]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProject(): ProjectState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useProject outside ProjectProvider');
  return ctx;
}
