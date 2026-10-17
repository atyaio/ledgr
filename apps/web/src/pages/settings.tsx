import { clsx } from 'clsx';
import { ArrowDown, ArrowUp, MoreHorizontal, Pencil, Plus, Smartphone, Trash2, Share } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CUSTOM_FIELD_ENTITIES, type CustomFieldDefinition, type CustomFieldEntity } from '@ledgr/shared';
import { useProject } from '@/lib/project';
import { useAudit, useCustomFieldMutations, useCustomFields, useProjectMutations } from '@/lib/queries';
import { relativeTime } from '@/lib/format';
import { useInstallPrompt } from '@/lib/install';
import { CustomFieldForm } from '@/components/forms/custom-field-form';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Loading, PageHeader, Card, Tabs, ListRow, EmptyState } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { errorMessage, useToast } from '@/components/ui/toast';
import { ThemeSwitch } from '@/components/layout/shell';

type Tab = 'project' | 'phone' | 'fields' | 'audit';

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('project');
  return (
    <>
      <PageHeader title="Settings" />
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ id: 'project', label: 'Project' }, { id: 'phone', label: 'Phone' }, { id: 'fields', label: 'Custom fields' }, { id: 'audit', label: 'Audit log' }]} />
      {tab === 'project' && <ProjectTab />}
      {tab === 'phone' && <PhoneTab />}
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
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card className="xl:col-span-2" title="Project">
        <form className="space-y-4 max-w-lg" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency" hint="ISO 4217"><Input mono maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></Field>
            <Field label="Locale" hint="formatting"><Input mono value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="en-US" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Week starts on"><Select value={week} onChange={(e) => setWeek(Number(e.target.value) as typeof week)}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</Select></Field>
            <Field label="Fiscal year starts"><Select value={fy} onChange={(e) => setFy(Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Select></Field>
          </div>
          {currency !== c.currency && <p className="text-[13px] text-warning">Changing currency relabels amounts; it does not convert them.</p>}
          <Button type="submit" variant="primary" size="md" disabled={!dirty} loading={update.isPending}>Save changes</Button>
        </form>
      </Card>
      <div className="space-y-4">
        <Card title="Appearance"><ThemeSwitch /></Card>
        <Card title="About this project">
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-[13.5px]">
            <dt className="text-ink-3">Auth</dt><dd>{c.auth.mode === 'supabase' ? <Badge tone="good">Supabase · admins only</Badge> : <Badge tone="warning">None · local only</Badge>}</dd>
            <dt className="text-ink-3">Entries</dt><dd className="num">{project.stats.expenses} expenses · {project.stats.revenue} revenue</dd>
            <dt className="text-ink-3">Period</dt><dd className="num">{project.stats.firstEntryDate ?? '—'} → {project.stats.lastEntryDate ?? '—'}</dd>
            <dt className="text-ink-3">Version</dt><dd className="num">ledgr {project.version}</dd>
          </dl>
          <p className="text-[12.5px] text-ink-3 mt-3 leading-relaxed">Data lives in <code className="mono">.ledgr/data.db</code> next to this project. Auth settings are in <code className="mono">.ledgr/config.json</code>; restart after changing them.</p>
        </Card>
      </div>
    </div>
  );
}

function PhoneTab() {
  const { canInstall, install, installed, isIOS, isStandalone } = useInstallPrompt();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card className="xl:col-span-2" title="Add ledgr to your home screen" subtitle="Works like an app: full screen, its own icon, quick-add shortcuts.">
        <div className="space-y-4 text-[14px]">
          {isStandalone && <div className="rounded-[14px] bg-good/10 p-4">You are already running ledgr as an installed app.</div>}
          {!isStandalone && canInstall && (
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="primary" size="md" icon={<Smartphone className="size-4" />} onClick={install}>Install ledgr</Button>
              <span className="text-ink-3 text-[13px]">{installed ? 'Installed. Open it from your home screen.' : 'One tap, no app store.'}</span>
            </div>
          )}
          {!isStandalone && !canInstall && (
            <ol className="space-y-3 list-decimal pl-5 text-ink-2 leading-relaxed">
              {isIOS ? (
                <>
                  <li>Open this page in <strong className="text-ink">Safari</strong>, tap <Share className="inline size-4 -mt-0.5" /> <strong className="text-ink">Share</strong>.</li>
                  <li>Choose <strong className="text-ink">Add to Home Screen</strong>, then <strong className="text-ink">Add</strong>.</li>
                </>
              ) : (
                <>
                  <li>Open this page in Chrome, tap the <strong className="text-ink">⋮ menu</strong>.</li>
                  <li>Choose <strong className="text-ink">Add to Home screen</strong> (or <strong className="text-ink">Install app</strong>).</li>
                </>
              )}
            </ol>
          )}
          <div className="rounded-[14px] border border-line p-4">
            <div className="font-medium mb-1">Quick-add shortcuts</div>
            <p className="text-ink-2 text-[13.5px] leading-relaxed">
              On Android, long-press the installed icon to get <strong className="text-ink">Add expense</strong> and <strong className="text-ink">Add revenue</strong> shortcuts.
              On iPhone, add these two links to your home screen the same way (Safari → Share → Add to Home Screen); each opens straight into the form, like a widget:
            </p>
            <ul className="mt-3 space-y-2">
              {[{ path: '/add/expense', label: 'Add expense', color: 'var(--s-expense)' }, { path: '/add/revenue', label: 'Add revenue', color: 'var(--s-revenue)' }].map((l) => (
                <li key={l.path} className="flex items-center justify-between gap-3 rounded-[12px] bg-sunken/60 px-3.5 py-2.5">
                  <span className="inline-flex items-center gap-2.5 min-w-0"><span className="size-7 rounded-[8px] inline-flex items-center justify-center text-white font-bold" style={{ background: l.color }}>+</span><span className="truncate"><span className="font-medium">{l.label}</span> <span className="mono text-[12px] text-ink-3">{origin}{l.path}</span></span></span>
                  <a href={l.path} className="text-accent text-[13px] font-medium shrink-0">Open</a>
                </li>
              ))}
            </ul>
            <p className="text-[12.5px] text-ink-3 mt-3">iPhone Shortcuts app users can also create a shortcut that opens one of these URLs and place it as a real home-screen widget.</p>
          </div>
        </div>
      </Card>
      <Card title="Why not a native widget?">
        <p className="text-[13.5px] text-ink-2 leading-relaxed">True home-screen widgets need a native iOS/Android app. ledgr is a web app that runs anywhere you host it, so it offers the next best thing: an installable app icon, OS-level shortcuts on Android, and single-purpose links that behave like widgets on iPhone.</p>
      </Card>
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
      <div className="flex items-center justify-between gap-3 mb-4">
        <Tabs value={entity} onChange={setEntity} items={CUSTOM_FIELD_ENTITIES.map((e) => ({ id: e, label: e[0]!.toUpperCase() + e.slice(1) }))} className="md:w-auto" />
        <Button variant="primary" size="sm" className="rounded-full shrink-0" icon={<Plus className="size-4" />} onClick={() => setEditing(null)}>New field</Button>
      </div>
      <Card flush>
        {q.isPending ? <Loading /> : !items.length ? <EmptyState title={`No custom fields on ${entity}s`} description="Add columns like “Client”, “Invoice no.” or “Reimbursable”." action={<Button variant="soft" onClick={() => setEditing(null)}>Add a field</Button>} /> : (
          <ul className="divide-y divide-line">
            {items.map((f, i) => (
              <li key={f.id} className={clsx('flex items-center', f.archived && 'opacity-50')}>
                <div className="pl-3 flex flex-col">
                  <button type="button" className="size-7 inline-flex items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-card-hover disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="size-3.5" /></button>
                  <button type="button" className="size-7 inline-flex items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-card-hover disabled:opacity-30" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="size-3.5" /></button>
                </div>
                <ListRow className="flex-1" title={<span className="inline-flex items-center gap-2">{f.label}{f.required && <Badge tone="accent">required</Badge>}{f.archived && <Badge>archived</Badge>}</span>} subtitle={<span><span className="mono">{f.key}</span> · {f.type}{f.options.length ? ` · ${f.options.join(', ')}` : ''}</span>} onClick={() => setEditing(f)} />
                <div className="pr-3">
                  <Menu trigger={() => <button type="button" className="size-9 inline-flex items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-card-hover" aria-label="Actions"><MoreHorizontal className="size-4" /></button>}>
                    {(close) => (<><MenuItem icon={<Pencil />} onClick={() => { close(); setEditing(f); }}>Edit</MenuItem><MenuSeparator /><MenuItem icon={<Trash2 />} danger onClick={() => { close(); setConfirm(f); }}>Delete</MenuItem></>)}
                  </Menu>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
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
    <Card title="Audit log" flush actions={<div className="flex gap-2"><Select compact className="w-36" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }}><option value="">All entities</option>{['expense', 'revenue', 'stakeholder', 'category', 'settlement', 'customField', 'recurringRule', 'project', 'import', 'backup'].map((x) => <option key={x} value={x}>{x}</option>)}</Select><Select compact className="w-32" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}><option value="">All actions</option>{['create', 'update', 'delete', 'import', 'settle', 'recompute', 'generate', 'restore'].map((x) => <option key={x} value={x}>{x}</option>)}</Select></div>}>
      {q.isPending && <Loading />}
      {q.data && !q.data.items.length && <EmptyState title="Nothing recorded yet" />}
      <ul className="divide-y divide-line">
        {q.data?.items.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => setOpen(open === a.id ? null : a.id)} className="w-full text-left px-4 md:px-5 py-3 row-hover">
              <div className="flex items-center gap-2 flex-wrap text-[13.5px]">
                <Badge tone={a.action === 'delete' ? 'critical' : a.action === 'create' || a.action === 'import' ? 'good' : 'neutral'}>{a.action}</Badge>
                <span className="font-medium">{a.entity}</span>
                <span className="text-ink-3 truncate">{a.actorEmail}</span>
                <span className="ml-auto text-ink-3 num text-[12.5px]" title={new Date(a.at).toLocaleString()}>{relativeTime(a.at)}</span>
              </div>
              <div className="text-[12.5px] text-ink-3 mt-1 truncate">{summarize(a.before, a.after)}</div>
              {open === a.id && <pre className="mono whitespace-pre-wrap max-h-64 overflow-auto text-[11.5px] bg-sunken rounded-[10px] p-3 mt-2">{JSON.stringify({ before: a.before, after: a.after }, null, 2)}</pre>}
            </button>
          </li>
        ))}
      </ul>
      {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />}
    </Card>
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
