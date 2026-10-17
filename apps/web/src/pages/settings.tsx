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
import { LanguageSwitch, ThemeSwitch } from '@/components/layout/shell';
import { useI18n, type I18n } from '@/i18n';

type Tab = 'project' | 'phone' | 'fields' | 'audit';

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('project');
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('Settings')} />
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ id: 'project', label: t('Project') }, { id: 'phone', label: t('Phone') }, { id: 'fields', label: t('Custom fields') }, { id: 'audit', label: t('Audit log') }]} />
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
  const { t } = useI18n();
  const c = project.config;
  const [name, setName] = useState(c.name);
  const [nameAr, setNameAr] = useState(c.nameAr ?? '');
  const [currency, setCurrency] = useState(c.currency);
  const [locale, setLocale] = useState(c.locale);
  const [week, setWeek] = useState(c.weekStartsOn);
  const [fy, setFy] = useState(c.fiscalYearStartMonth);
  useEffect(() => { setName(c.name); setNameAr(c.nameAr ?? ''); setCurrency(c.currency); setLocale(c.locale); setWeek(c.weekStartsOn); setFy(c.fiscalYearStartMonth); }, [c]);
  const dirty = name !== c.name || nameAr !== (c.nameAr ?? '') || currency !== c.currency || locale !== c.locale || week !== c.weekStartsOn || fy !== c.fiscalYearStartMonth;
  const save = async () => {
    try { await update.mutateAsync({ name: name.trim(), nameAr: nameAr.trim(), currency: currency.toUpperCase(), locale, weekStartsOn: week, fiscalYearStartMonth: fy }); toast.success(t('Project updated')); } catch (e) { toast.error(t('Could not save'), errorMessage(e)); }
  };
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card className="xl:col-span-2" title={t('Project')}>
        <form className="space-y-4 max-w-lg" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <Field label={t('Name')}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label={t('Arabic name')} hint={t('optional')}><Input lang="ar" dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('Currency')} hint="ISO 4217"><Input mono maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></Field>
            <Field label={t('Locale')} hint={t('formatting')}><Input mono value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="en-US" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('Week starts on')}><Select value={week} onChange={(e) => setWeek(Number(e.target.value) as typeof week)}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{t(d)}</option>)}</Select></Field>
            <Field label={t('Fiscal year starts')}><Select value={fy} onChange={(e) => setFy(Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{t(m)}</option>)}</Select></Field>
          </div>
          {currency !== c.currency && <p className="text-[13px] text-warning">{t('Changing currency relabels amounts; it does not convert them.')}</p>}
          <Button type="submit" variant="primary" size="md" disabled={!dirty} loading={update.isPending}>{t('Save changes')}</Button>
        </form>
      </Card>
      <div className="space-y-4">
        <Card title={t('Appearance')}><div className="space-y-3"><div><div className="label mb-1.5">{t('Theme')}</div><ThemeSwitch /></div><div><div className="label mb-1.5">{t('Language')}</div><LanguageSwitch /></div></div></Card>
        <Card title={t('About this project')}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-[13.5px]">
            <dt className="text-ink-3">{t('Auth')}</dt><dd>{c.auth.mode === 'supabase' ? <Badge tone="good">{t('Supabase · admins only')}</Badge> : <Badge tone="warning">{t('None · local only')}</Badge>}</dd>
            <dt className="text-ink-3">{t('Entries')}</dt><dd className="num">{t('{expenses} expenses · {revenue} revenue', { expenses: project.stats.expenses, revenue: project.stats.revenue })}</dd>
            <dt className="text-ink-3">{t('Period')}</dt><dd className="num">{t('{from} → {to}', { from: project.stats.firstEntryDate ?? '—', to: project.stats.lastEntryDate ?? '—' })}</dd>
            <dt className="text-ink-3">{t('Version')}</dt><dd className="num">ledgr {project.version}</dd>
          </dl>
          <p className="text-[12.5px] text-ink-3 mt-3 leading-relaxed">{t('Data lives in')} <code className="mono">.ledgr/data.db</code> {t('next to this project. Auth settings are in')} <code className="mono">.ledgr/config.json</code>{t('; restart after changing them.')}</p>
        </Card>
      </div>
    </div>
  );
}

function PhoneTab() {
  const { canInstall, install, installed, isIOS, isStandalone } = useInstallPrompt();
  const { t } = useI18n();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card className="xl:col-span-2" title={t('Add ledgr to your home screen')} subtitle={t('Works like an app: full screen, its own icon, quick-add shortcuts.')}>
        <div className="space-y-4 text-[14px]">
          {isStandalone && <div className="rounded-[14px] bg-good/10 p-4">{t('You are already running ledgr as an installed app.')}</div>}
          {!isStandalone && canInstall && (
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="primary" size="md" icon={<Smartphone className="size-4" />} onClick={install}>{t('Install ledgr')}</Button>
              <span className="text-ink-3 text-[13px]">{t(installed ? 'Installed. Open it from your home screen.' : 'One tap, no app store.')}</span>
            </div>
          )}
          {!isStandalone && !canInstall && (
            <ol className="space-y-3 list-decimal ps-5 text-ink-2 leading-relaxed">
              {isIOS ? (
                <>
                  <li>{t('Open this page in')} <strong className="text-ink">Safari</strong>{t(', tap')} <Share className="inline size-4 -mt-0.5" /> <strong className="text-ink">{t('Share')}</strong>.</li>
                  <li>{t('Choose')} <strong className="text-ink">{t('Add to Home Screen')}</strong>{t(', then')} <strong className="text-ink">{t('Add')}</strong>.</li>
                </>
              ) : (
                <>
                  <li>{t('Open this page in Chrome, tap the')} <strong className="text-ink">{t('⋮ menu')}</strong>.</li>
                  <li>{t('Choose')} <strong className="text-ink">{t('Add to Home screen')}</strong> ({t('or')} <strong className="text-ink">{t('Install app')}</strong>).</li>
                </>
              )}
            </ol>
          )}
          <div className="rounded-[14px] border border-line p-4">
            <div className="font-medium mb-1">{t('Quick-add shortcuts')}</div>
            <p className="text-ink-2 text-[13.5px] leading-relaxed">
              {t('On Android, long-press the installed icon to get the')} <strong className="text-ink">{t('Add expense')}</strong> {t('and')} <strong className="text-ink">{t('Add revenue')}</strong> {t('shortcuts.')}{' '}
              {t('On iPhone, add these two links to your home screen the same way (Safari → Share → Add to Home Screen); each opens straight into the form, like a widget:')}
            </p>
            <ul className="mt-3 space-y-2">
              {[{ path: '/add/expense', label: 'Add expense', color: 'var(--s-expense)' }, { path: '/add/revenue', label: 'Add revenue', color: 'var(--s-revenue)' }].map((l) => (
                <li key={l.path} className="flex items-center justify-between gap-3 rounded-[12px] bg-sunken/60 px-3.5 py-2.5">
                  <span className="inline-flex items-center gap-2.5 min-w-0"><span className="size-7 rounded-[8px] inline-flex items-center justify-center text-white font-bold" style={{ background: l.color }}>+</span><span className="truncate"><span className="font-medium">{t(l.label)}</span> <span className="mono text-[12px] text-ink-3">{origin}{l.path}</span></span></span>
                  <a href={l.path} className="text-accent text-[13px] font-medium shrink-0">{t('Open')}</a>
                </li>
              ))}
            </ul>
            <p className="text-[12.5px] text-ink-3 mt-3">{t('iPhone Shortcuts app users can also create a shortcut that opens one of these URLs and place it as a real home-screen widget.')}</p>
          </div>
        </div>
      </Card>
      <Card title={t('Why not a native widget?')}>
        <p className="text-[13.5px] text-ink-2 leading-relaxed">{t('True home-screen widgets need a native iOS/Android app. ledgr is a web app that runs anywhere you host it, so it offers the next best thing: an installable app icon, OS-level shortcuts on Android, and single-purpose links that behave like widgets on iPhone.')}</p>
      </Card>
    </div>
  );
}

const ENTITY_LABEL: Record<CustomFieldEntity, string> = { expense: 'Expense', revenue: 'Revenue', stakeholder: 'Stakeholder' };
const NO_FIELDS: Record<CustomFieldEntity, string> = { expense: 'No custom fields on expenses', revenue: 'No custom fields on revenues', stakeholder: 'No custom fields on stakeholders' };

function FieldsTab() {
  const [entity, setEntity] = useState<CustomFieldEntity>('expense');
  const { t, label } = useI18n();
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
    try { await reorder.mutateAsync(ids); } catch (e) { toast.error(t('Reorder failed'), errorMessage(e)); }
  };
  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4">
        <Tabs value={entity} onChange={setEntity} items={CUSTOM_FIELD_ENTITIES.map((e) => ({ id: e, label: t(ENTITY_LABEL[e]) }))} className="md:w-auto" />
        <Button variant="primary" size="sm" className="rounded-full shrink-0" icon={<Plus className="size-4" />} onClick={() => setEditing(null)}>{t('New field')}</Button>
      </div>
      <Card flush>
        {q.isPending ? <Loading /> : !items.length ? <EmptyState title={t(NO_FIELDS[entity])} description={t('Add columns like “Client”, “Invoice no.” or “Reimbursable”.')} action={<Button variant="soft" onClick={() => setEditing(null)}>{t('Add a field')}</Button>} /> : (
          <ul className="divide-y divide-line">
            {items.map((f, i) => (
              <li key={f.id} className={clsx('flex items-center', f.archived && 'opacity-50')}>
                <div className="ps-3 flex flex-col">
                  <button type="button" className="size-7 inline-flex items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-card-hover disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('Move up')}><ArrowUp className="size-3.5" /></button>
                  <button type="button" className="size-7 inline-flex items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-card-hover disabled:opacity-30" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={t('Move down')}><ArrowDown className="size-3.5" /></button>
                </div>
                <ListRow className="flex-1" title={<span className="inline-flex items-center gap-2">{label(f)}{f.required && <Badge tone="accent">{t('required')}</Badge>}{f.archived && <Badge>{t('archived')}</Badge>}</span>} subtitle={<span><span className="mono">{f.key}</span> · {t(f.type)}{f.options.length ? ` · ${f.options.join(', ')}` : ''}</span>} onClick={() => setEditing(f)} />
                <div className="pe-3">
                  <Menu trigger={() => <button type="button" className="size-9 inline-flex items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-card-hover" aria-label={t('Actions')}><MoreHorizontal className="size-4" /></button>}>
                    {(close) => (<><MenuItem icon={<Pencil />} onClick={() => { close(); setEditing(f); }}>{t('Edit')}</MenuItem><MenuSeparator /><MenuItem icon={<Trash2 />} danger onClick={() => { close(); setConfirm(f); }}>{t('Delete')}</MenuItem></>)}
                  </Menu>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <CustomFieldForm open={editing !== undefined} onClose={() => setEditing(undefined)} field={editing ?? null} entity={entity} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={async () => { try { await remove.mutateAsync(confirm!.id); toast.success(t('Field deleted')); setConfirm(null); } catch (e) { toast.error(t('Delete failed'), errorMessage(e)); } }} loading={remove.isPending} title={t('Delete field “{name}”?', { name: confirm ? label(confirm) : '' })} description={t('Existing values stay in the records but are no longer shown or exported.')} />
    </>
  );
}

function AuditTab() {
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const q = useAudit({ page, pageSize: 50, entity: entity || undefined, action: action || undefined });
  const [open, setOpen] = useState<string | null>(null);
  const { t } = useI18n();
  return (
    <Card title={t('Audit log')} flush actions={<div className="flex gap-2"><Select compact className="w-36" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }}><option value="">{t('All entities')}</option>{['expense', 'revenue', 'stakeholder', 'category', 'settlement', 'customField', 'recurringRule', 'project', 'import', 'backup'].map((x) => <option key={x} value={x}>{t(x)}</option>)}</Select><Select compact className="w-32" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}><option value="">{t('All actions')}</option>{['create', 'update', 'delete', 'import', 'settle', 'recompute', 'generate', 'restore'].map((x) => <option key={x} value={x}>{t(x)}</option>)}</Select></div>}>
      {q.isPending && <Loading />}
      {q.data && !q.data.items.length && <EmptyState title={t('Nothing recorded yet')} />}
      <ul className="divide-y divide-line">
        {q.data?.items.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => setOpen(open === a.id ? null : a.id)} className="w-full text-start px-4 md:px-5 py-3 row-hover">
              <div className="flex items-center gap-2 flex-wrap text-[13.5px]">
                <Badge tone={a.action === 'delete' ? 'critical' : a.action === 'create' || a.action === 'import' ? 'good' : 'neutral'}>{t(a.action)}</Badge>
                <span className="font-medium">{t(a.entity)}</span>
                <span className="text-ink-3 truncate">{a.actorEmail}</span>
                <span className="ms-auto text-ink-3 num text-[12.5px]" title={new Date(a.at).toLocaleString()}>{relativeTime(a.at)}</span>
              </div>
              <div className="text-[12.5px] text-ink-3 mt-1 truncate">{summarize(a.before, a.after, t)}</div>
              {open === a.id && <pre className="mono whitespace-pre-wrap max-h-64 overflow-auto text-[11.5px] bg-sunken rounded-[10px] p-3 mt-2">{JSON.stringify({ before: a.before, after: a.after }, null, 2)}</pre>}
            </button>
          </li>
        ))}
      </ul>
      {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />}
    </Card>
  );
}

function summarize(before: unknown, after: unknown, t: I18n['t']): string {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  if (!before && after) return pickSummary(a);
  if (before && !after) return pickSummary(b);
  const keys = Object.keys({ ...b, ...a }).filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]) && !['updatedAt', 'splits'].includes(k));
  return keys.length ? keys.map((k) => `${k}: ${fmt(b[k])} → ${fmt(a[k])}`).join(' · ') : t('no visible change');
}
function pickSummary(o: Record<string, unknown>): string {
  return ['description', 'name', 'label', 'amountMinor', 'date', 'inserted', 'count'].filter((k) => k in o).map((k) => `${k}: ${fmt(o[k])}`).join(' · ') || JSON.stringify(o).slice(0, 120);
}
function fmt(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 40);
  return String(v).slice(0, 40);
}
