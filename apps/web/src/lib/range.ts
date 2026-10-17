import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { detectPreset, rangeForPreset, shiftRange, type DateRange, type RangePreset } from '@ledgr/shared';
import { useProject } from './project';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Global date range, persisted in the URL (?from&to) and shared by every page. */
export function useDateRange() {
  const [params, setParams] = useSearchParams();
  const { weekStartsOn, fiscalYearStartMonth } = useProject();
  const calendar = useMemo(() => ({ weekStartsOn, fiscalYearStartMonth }), [weekStartsOn, fiscalYearStartMonth]);

  const range = useMemo<DateRange>(() => {
    const from = params.get('from');
    const to = params.get('to');
    if (from && to && ISO.test(from) && ISO.test(to) && from <= to) return { from, to };
    return rangeForPreset('month', calendar);
  }, [params, calendar]);

  const preset = useMemo(() => detectPreset(range, calendar), [range, calendar]);

  const setRange = useCallback(
    (r: DateRange) => {
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
