import { clsx } from 'clsx';
import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { useI18n } from '@/i18n';

export function Table({ className, children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={clsx('w-full border-collapse text-[14px]', className)} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function Th({ className, children, align = 'left', sortable, sorted, onSort, ...rest }: ThHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center'; sortable?: boolean; sorted?: 'asc' | 'desc' | null; onSort?: () => void }) {
  const Icon = sorted === 'asc' ? ChevronUp : sorted === 'desc' ? ChevronDown : ChevronsUpDown;
  return (
    <th
      className={clsx(
        'label h-10 px-4 border-b border-line bg-card sticky top-0 z-[1] whitespace-nowrap font-medium',
        align === 'right' && 'text-end',
        align === 'center' && 'text-center',
        sortable && 'cursor-pointer select-none hover:text-ink',
        className,
      )}
      onClick={sortable ? onSort : undefined}
      aria-sort={sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : undefined}
      {...rest}
    >
      <span className={clsx('inline-flex items-center gap-1', align === 'right' && 'flex-row-reverse')}>
        {children}
        {sortable && <Icon className={clsx('size-3.5', sorted ? 'text-accent' : 'text-ink-4')} />}
      </span>
    </th>
  );
}

export function Td({ className, children, align = 'left', ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <td className={clsx('h-12 px-4 border-b border-line align-middle', align === 'right' && 'text-end', align === 'center' && 'text-center', className)} {...rest}>
      {children}
    </td>
  );
}

export function Tr({ className, selected, children, ...rest }: HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return (
    <tr className={clsx('row-hover transition-colors last:[&>td]:border-b-0', selected && 'bg-accent-soft/60', className)} {...rest}>
      {children}
    </tr>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="h-36 text-center text-ink-3 text-[14px]">
        {children}
      </td>
    </tr>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-4 h-12 border-t border-line text-[13px] text-ink-3">
      <span className="num">{t('{from}–{to} of {total}', { from, to, total })}</span>
      <div className="flex items-center gap-1">
        <button type="button" className="h-8 px-3 rounded-[9px] hover:bg-card-hover disabled:opacity-40 font-medium" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          {t('Prev')}
        </button>
        <span className="num px-1">
          {page} / {pages}
        </span>
        <button type="button" className="h-8 px-3 rounded-[9px] hover:bg-card-hover disabled:opacity-40 font-medium" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          {t('Next')}
        </button>
      </div>
    </div>
  );
}
