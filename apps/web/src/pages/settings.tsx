import { clsx } from 'clsx';
import { ArrowDown, ArrowUp, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CUSTOM_FIELD_ENTITIES, type CustomFieldDefinition, type CustomFieldEntity } from '@ledgr/shared';
import { useProject } from '@/lib/project';
import { useAudit, useCustomFieldMutations, useCustomFields, useProjectMutations } from '@/lib/queries';
import { relativeTime } from '@/lib/format';
import { CustomFieldForm } from '@/components/forms/custom-field-form';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Loading, PageHeader, Panel, Tabs } from '@/components/ui/misc';
import { EmptyRow, Pagination, Table, Td, Th, Tr } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { errorMessage, useToast } from '@/components/ui/toast';

type Tab = 'project' | 'fields' | 'audit';

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('project');
  return (
    <>
      <PageHeader title="Settings" subtitle="Project identity, custom columns and the audit trail." />
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ id: 'project', label: 'Project' }, { id: 'fields', label: 'Custom fields' }, { id: 'audit', label: 'Audit log' }]} />
      {tab === 'project' && <ProjectTab />}
      {tab === 'fields' && <FieldsTab />}
      {tab === 'audit' && <AuditTab />}
    </>
  );
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function ProjectTab() {
  const { project } = useProject();
  const { update } = useProjectMutations();
  const toast = useToast();
  const c = project.config;
  const [name, setName] = useState(c.name);
  const [currency, setCurrency] = useState(c.currency);
  const [locale, setLocale] = useState(c.locale);
  const [week, setWeek] = useState(c.weekStartsOn);
  const [fy, setFy] = useState(c.fiscalYearStartMonth);
  useEffect(() => { setName(c.name); setCurrency(c.currency); setLocale(c.locale); setWeek(c.weekStartsOn); setFy(c.fiscalYearStartMonth); }, [c]);
  const dirty = name !== c.name || currency !== c.currency || locale !== c.locale || week !== c.weekStartsOn || fy !== c.fiscalYearStartMonth;
  const save = async () => {
    try { await update.mutateAsync({ name: name.trim(), currency: currency.toUpperCase(), locale, weekStartsOn: week, fiscalYearStartMonth: fy }); toast.success('Project updated'); } catch (e) { toast.error('Could not save', errorMessage(e)); }
  };
  return (
    <div className="grid grid-cols-12 gap-4">
      <Panel className="col-span-12 xl:col-span-7" title="Project">
        <form className="p-4 space-y-3 max-w-lg" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency" hint="ISO 4217"><Input mono maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></Field>
            <Field label="Locale" hint="formatting"><Input mono value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="en-US" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Week starts on"><Select value={week} onChange={(e) => setWeek(Number(e.target.value) as typeof week)}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</Select></Field>
            <Field label="Fiscal year starts"><Select value={fy} onChange={(e) => setFy(Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Select></Field>
          </div>
          {currency !== c.currency && <p className="text-[11.5px] text-warning">Changing currency relabels amounts; it does not convert them.</p>}
          <div className="pt-1"><Button type="submit" variant="primary" disabled={!dirty} loading={update.isPending}>Save changes</Button></div>
        </form>
      </Panel>
      <Panel className="col-span-12 xl:col-span-5" title="About this project">
        <dl className="p-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[12.5px]">
          <dt className="eyebrow">Slug</dt><dd className="num">{c.slug}</dd>
          <dt className="eyebrow">Auth</dt><dd>{c.auth.mode === 'supabase' ? <Badge tone="good">Supabase · admins only</Badge> : <Badge tone="warning">none · local only</Badge>}</dd>
          <dt className="eyebrow">Entries</dt><dd className="num">{project.stats.expenses} expenses · {project.stats.revenue} revenue</dd>
          <dt className="eyebrow">Period</dt><dd className="num">{project.stats.firstEntryDate ?? '—'} → {project.stats.lastEntryDate ?? '—'}</dd>
          <dt className="eyebrow">Version</dt><dd className="num">ledgr {project.version}</dd>
        </dl>
        <div className="px-4 pb-4 text-[11.5px] text-ink-3 leading-relaxed">Data lives in <code className="num">.ledgr/data.db</code> next to this project. Config in <code className="num">.ledgr/config.json</code>. Change auth settings there and restart.</div>
      </Panel>
    </div>
  );
}

function FieldsTab() {
  const [entity, setEntity] = useState<CustomFieldEntity>('expense');
  const q = useCustomFields(entity, true);
  const { remove, reorder } = useCustomFieldMutations();
  const toast = useToast();
  const [editing, setEditing] = useState<CustomFieldDefinition | null | undefined>(undefined);
  const [confirm, setConfirm] = useState<CustomFieldDefinition | null>(null);
  const items = useMemo(() => [...(q.data?.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder), [q.data]);
  const move = async (i: number, dir: -1 | 1) => {
    const ids = items.map((f) => f.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    try { await reorder.mutateAsync(ids); } catch (e) { toast.error('Reorder failed', errorMessage(e)); }
  };
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <Tabs value={entity} onChange={setEntity} items={CUSTOM_FIELD_ENTITIES.map((e) => ({ id: e, label: e[0]!.toUpperCase() + e.slice(1) }))} />
        <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing(null)}>New field</Button>
      </div>
      <Panel>
        {q.isPending ? <Loading /> : (
          <Table>
            <thead><tr><Th className="w-16">Order</Th><Th>Label</Th><Th>Key</Th><Th>Type</Th><Th>Options</Th><Th>Required</Th><Th className="w-10" /></tr></thead>
            <tbody>
              {!items.length && <EmptyRow colSpan={7}>No custom fields on {entity}s. Add columns like “Client”, “Invoice no.” or “Reimbursable”.</EmptyRow>}
              {items.map((f, i) => (
                <Tr key={f.id} className={clsx(f.archived && 'opacity-50')}>
                  <Td><span className="inline-flex gap-0.5"><button className="size-5 inline-flex items-center justify-center rounded text-ink-3 hover:text-ink hover:bg-hover disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="size-3" /></button><button className="size-5 inline-flex items-center justify-center rounded text-ink-3 hover:text-ink hover:bg-hover disabled:opacity-30" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="size-3" /></button></span></Td>
                  <Td className="font-medium">{f.label}{f.archived && <Badge className="ml-2">archived</Badge>}</Td>
                  <Td className="num text-ink-2">{f.key}</Td>
                  <Td><Badge tone="info">{f.type}</Badge></Td>
                  <Td className="text-ink-3 truncate max-w-[240px]">{f.options.join(', ')}</Td>
                  <Td>{f.required ? 'Yes' : <span className="text-ink-4">—</span>}</Td>
                  <Td>
                    <Menu trigger={() => <button className="size-6 inline-flex items-center justify-center rounded text-ink-3 hover:text-ink hover:bg-hover" aria-label="Actions"><MoreHorizontal className="size-3.5" /></button>}>
                      {(close) => (<><MenuItem icon={<Pencil />} onClick={() => { close(); setEditing(f); }}>Edit</MenuItem><MenuSeparator /><MenuItem icon={<Trash2 />} danger onClick={() => { close(); setConfirm(f); }}>Delete</MenuItem></>)}
                    </Menu>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
      <CustomFieldForm open={editing !== undefined} onClose={() => setEditing(undefined)} field={editing ?? null} entity={entity} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={async () => { try { await remove.mutateAsync(confirm!.id); toast.success('Field deleted'); setConfirm(null); } catch (e) { toast.error('Delete failed', errorMessage(e)); } }} loading={remove.isPending} title={`Delete field “${confirm?.label}”?`} description="Existing values stay in the records but are no longer shown or exported." />
    </>
  );
}

function AuditTab() {
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const q = useAudit({ page, pageSize: 50, entity: entity || undefined, action: action || undefined });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Panel title="Audit log" actions={<div className="flex gap-2"><Select className="h-7 w-36" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }}><option value="">All entities</option>{['expense', 'revenue', 'stakeholder', 'category', 'settlement', 'custom-field', 'recurring', 'project', 'import', 'backup'].map((x) => <option key={x} value={x}>{x}</option>)}</Select><Select className="h-7 w-32" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}><option value="">All actions</option>{['create', 'update', 'delete', 'import', 'settle', 'recompute', 'generate', 'restore'].map((x) => <option key={x} value={x}>{x}</option>)}</Select></div>}>
      <Table>
        <thead><tr><Th className="w-32">When</Th><Th>Actor</Th><Th>Action</Th><Th>Entity</Th><Th>Change</Th></tr></thead>
        <tbody>
          {q.isPending && <EmptyRow colSpan={5}>Loading…</EmptyRow>}
          {q.data && !q.data.items.length && <EmptyRow colSpan={5}>Nothing recorded yet.</EmptyRow>}
          {q.data?.items.map((a) => (
            <Tr key={a.id} className="cursor-pointer" onClick={() => setOpen(open === a.id ? null : a.id)}>
              <Td className="num text-ink-2 whitespace-nowrap" title={new Date(a.at).toLocaleString()}>{relativeTime(a.at)}</Td>
              <Td className="text-ink-2 truncate max-w-[200px]">{a.actorEmail}</Td>
              <Td><Badge tone={a.action === 'delete' ? 'critical' : a.action === 'create' || a.action === 'import' ? 'good' : 'neutral'}>{a.action}</Badge></Td>
              <Td className="num text-ink-2">{a.entity}{a.entityId && <span className="text-ink-4"> · {a.entityId.slice(-8)}</span>}</Td>
              <Td className="text-[11.5px] text-ink-3">
                {open === a.id ? (
                  <pre className="num whitespace-pre-wrap max-h-64 overflow-auto text-[11px] bg-sunken rounded p-2 my-1">{JSON.stringify({ before: a.before, after: a.after }, null, 2)}</pre>
                ) : (
                  <span className="truncate inline-block max-w-[420px] align-middle">{summarize(a.before, a.after)}</span>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />}
    </Panel>
  );
}

function summarize(before: unknown, after: unknown): string {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  if (!before && after) return pickSummary(a);
  if (before && !after) return pickSummary(b);
  const keys = Object.keys({ ...b, ...a }).filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]) && !['updatedAt', 'splits'].includes(k));
  return keys.length ? keys.map((k) => `${k}: ${fmt(b[k])} → ${fmt(a[k])}`).join(' · ') : 'no visible change';
}
function pickSummary(o: Record<string, unknown>): string {
  return ['description', 'name', 'label', 'amountMinor', 'date', 'inserted', 'count'].filter((k) => k in o).map((k) => `${k}: ${fmt(o[k])}`).join(' · ') || JSON.stringify(o).slice(0, 120);
}
function fmt(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 40);
  return String(v).slice(0, 40);
}
