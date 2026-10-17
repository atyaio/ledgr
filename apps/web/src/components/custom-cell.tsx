import type { CustomFieldDefinition, CustomFieldValue } from '@ledgr/shared';
import { useProject } from '@/lib/project';

export function CustomCell({ def, value }: { def: CustomFieldDefinition; value: CustomFieldValue | undefined }) {
  const { money, date } = useProject();
  if (value === null || value === undefined || value === '') return <span className="text-ink-4">—</span>;
  switch (def.type) {
    case 'money':
      return <span className="num">{money(Number(value))}</span>;
    case 'number':
      return <span className="num">{Number(value).toLocaleString()}</span>;
    case 'date':
      return <span className="num text-ink-2">{date(String(value))}</span>;
    case 'boolean':
      return <span className={value ? 'text-good' : 'text-ink-3'}>{value ? 'Yes' : 'No'}</span>;
    case 'select':
      return <span className="inline-flex h-5 items-center px-1.5 rounded-sm bg-raised border border-line text-[11px]">{String(value)}</span>;
    default:
      return <span className="text-ink-2 truncate inline-block max-w-[200px] align-middle">{String(value)}</span>;
  }
}
