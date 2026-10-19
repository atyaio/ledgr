import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router';
import { detectPreset, rangeForPreset, shiftRange, type DateRange, type RangePreset } from '@atyaio/ledgr-shared';
import { useProject } from './project';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The last range the user chose, kept only for this app instance (module state, never storage):
 * a reload or closing the PWA forgets it. Used whenever a page is opened without ?from&to.
 */
let remembered: DateRange | null = null;
const listeners = new Set<() => void>();

function remember(r: DateRange) {
  if (remembered && remembered.from === r.from && remembered.to === r.to) return;
  remembered = r;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function useRememberedRange() {
  return useSyncExternalStore(subscribe, () => remembered, () => remembered);
}

/** Global date range, persisted in the URL (?from&to) and shared by every page. Defaults to all time. */
export function useDateRange() {
  const [params, setParams] = useSearchParams();
  const { weekStartsOn, fiscalYearStartMonth } = useProject();
  const calendar = useMemo(() => ({ weekStartsOn, fiscalYearStartMonth }), [weekStartsOn, fiscalYearStartMonth]);
  const last = useRememberedRange();

  const fromUrl = useMemo<DateRange | null>(() => {
    const from = params.get('from');
    const to = params.get('to');
    if (from && to && ISO.test(from) && ISO.test(to) && from <= to) return { from, to };
    return null;
  }, [params]);

  // An explicit range in the URL wins, and becomes the one we remember for pages opened without one.
  useEffect(() => {
    if (fromUrl) remember(fromUrl);
  }, [fromUrl]);

  const range = useMemo<DateRange>(() => fromUrl ?? last ?? rangeForPreset('all', calendar), [fromUrl, last, calendar]);

  const preset = useMemo(() => detectPreset(range, calendar), [range, calendar]);

  const setRange = useCallback(
    (r: DateRange) => {
      remember(r);
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('from', r.from);
          next.set('to', r.to);
          next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setPreset = useCallback((p: RangePreset) => setRange(rangeForPreset(p, calendar)), [setRange, calendar]);
  const shift = useCallback((dir: -1 | 1) => setRange(shiftRange(range, dir)), [range, setRange]);

  return { range, preset, setRange, setPreset, shift, calendar };
}
