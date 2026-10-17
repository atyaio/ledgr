import { clsx } from 'clsx';
import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';

export function Table({ className, children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={clsx('w-full border-collapse text-[12.5px]', className)} {...rest}>
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
        'eyebrow font-medium h-8 px-3 border-b border-line bg-panel sticky top-0 z-[1] whitespace-nowrap',
        align === 'right' && 'text-right',
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
        {sortable && <Icon className={clsx('size-3', sorted ? 'text-accent' : 'text-ink-4')} />}
      </span>
    </th>
  );
}

export function Td({ className, children, align = 'left', ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <td className={clsx('h-9 px-3 border-b border-line/70 align-middle', align === 'right' && 'text-right', align === 'center' && 'text-center', className)} {...rest}>
      {children}
    </td>
  );
}

export function Tr({ className, selected, children, ...rest }: HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return (
    <tr className={clsx('row-hover transition-colors', selected && 'bg-accent-soft/60', className)} {...rest}>
      {children}
    </tr>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="h-32 text-center text-ink-3 text-[12.5px]">
        {children}
      </td>
    </tr>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 px-3 h-10 border-t border-line text-[12px] text-ink-3">
      <span className="num">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" className="h-6 px-2 rounded-sm hover:bg-hover disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Prev
        </button>
        <span className="num px-1">
          {page} / {pages}
        </span>
        <button type="button" className="h-6 px-2 rounded-sm hover:bg-hover disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
