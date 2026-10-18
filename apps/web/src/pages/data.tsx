import { clsx } from 'clsx';
import { Download, FileUp, ShieldCheck, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IMPORT_ENTITIES, type ImportCommitResponse, type ImportDateFormat, type ImportEntity, type ImportPreviewResponse } from '@atyaio/ledgr-shared';
import { api, downloadFile } from '@/lib/api';
import { useDateRange } from '@/lib/range';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Select } from '@/components/ui/input';
import { PageHeader, Card, Tabs } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { errorMessage, useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/dialog';
import { useI18n } from '@/i18n';

const LABELS: Record<ImportEntity, string> = { expenses: 'Expenses', revenue: 'Revenue', stakeholders: 'Stakeholders', categories: 'Categories', settlements: 'Settlements' };

export function DataPage() {
  const toast = useToast();
  const { t } = useI18n();
  const qc = useQueryClient();
  const { range } = useDateRange();
  const [entity, setEntity] = useState<ImportEntity>('expenses');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [dateFormat, setDateFormat] = useState<ImportDateFormat>('auto');
  const [createCats, setCreateCats] = useState(true);
  const [createSh, setCreateSh] = useState(false);
  const [skipDup, setSkipDup] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportCommitResponse | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [replace, setReplace] = useState(false);

  const pick = async (f: File) => {
    setFile(f);
    setResult(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const p = await api.upload<ImportPreviewResponse>(`/import/${entity}/preview`, fd);
      setPreview(p);
      setMapping(p.suggestedMapping);
      setDateFormat(p.detectedDateFormat);
    } catch (e) {
      toast.error(t('Could not read file'), errorMessage(e));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };
  const missingRequired = preview?.targets.filter((col) => col.required && !mapping[col.key]) ?? [];
  const commit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mapping', JSON.stringify(mapping));
      fd.append('options', JSON.stringify({ dateFormat, createMissingCategories: createCats, createMissingStakeholders: createSh, skipDuplicates: skipDup }));
      const r = await api.upload<ImportCommitResponse>(`/import/${entity}/commit`, fd);
      setResult(r);
      await qc.invalidateQueries();
      toast.success(t('Imported {n} {entity}', { n: r.inserted, entity: t(LABELS[entity]).toLowerCase() }), r.skipped ? t('{n} skipped', { n: r.skipped }) : undefined);
    } catch (e) {
      toast.error(t('Import failed'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const reset = () => { setFile(null); setPreview(null); setResult(null); setMapping({}); if (inputRef.current) inputRef.current.value = ''; };
  const restore = async () => {
    if (!restoreFile) return;
    setBusy(true);
    try {
      const json = JSON.parse(await restoreFile.text());
      await api.post(`/import/backup${replace ? '?replace=true' : ''}`, json);
      await qc.invalidateQueries();
      toast.success(t('Backup restored'));
      setRestoreOpen(false);
    } catch (e) {
      toast.error(t('Restore failed'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t('Import & export')} subtitle={t('Bulk-load from spreadsheets, export any ledger, back up the whole project.')} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2" title={t('Import a spreadsheet')}>
          <div className="space-y-4">
            <Tabs value={entity} onChange={(e) => { setEntity(e); reset(); }} items={IMPORT_ENTITIES.map((e) => ({ id: e, label: t(LABELS[e]) }))} />
            {!preview && (
              <div
                className={clsx('rounded-[16px] border-2 border-dashed p-8 text-center transition-colors cursor-pointer', drag ? 'border-accent bg-accent-soft' : 'border-line-strong hover:border-ink-3 bg-sunken/40')}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) pick(f); }}
                onClick={() => inputRef.current?.click()}
              >
                <FileUp className="size-7 mx-auto text-ink-3 mb-2" />
                <div className="text-[15px] font-medium">{t('Choose an Excel or CSV file')}</div>
                <div className="text-[13px] text-ink-3 mt-1">{t('Any column names: you map them next. Dates, money formats and category names are matched for you.')}</div>
                <input ref={inputRef} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); }} />
              </div>
            )}
            {!preview && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="xs" variant="soft" icon={<Download className="size-3.5" />} onClick={() => downloadFile(`/export/template/${entity}.xlsx`, `${entity}-template.xlsx`).catch((e) => toast.error(t('Failed'), errorMessage(e)))}>{t('Excel template')}</Button>
                <Button size="xs" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => downloadFile(`/export/template/${entity}.csv`, `${entity}-template.csv`).catch((e) => toast.error(t('Failed'), errorMessage(e)))}>{t('CSV template')}</Button>
                <span className="text-[12px] text-ink-3">{t('The Excel template has dropdowns for categories, partners and choice fields.')}</span>
              </div>
            )}
            {busy && !preview && <div className="text-[13px] text-ink-3">{t('Reading…')}</div>}
            {preview && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 text-[13.5px]">
                  <span className="min-w-0 truncate"><span className="font-medium">{file?.name}</span> <span className="text-ink-3 num">· {t('{n} rows', { n: preview.rowCount })}</span></span>
                  <Button size="xs" variant="ghost" onClick={reset}>{t('Change file')}</Button>
                </div>
                <div className="rounded-[14px] border border-line overflow-hidden">
                  <div className="hidden md:grid grid-cols-[1fr_1fr_1.4fr] label px-3.5 h-9 items-center border-b border-line bg-sunken/60"><span>{t('Field')}</span><span>{t('CSV column')}</span><span>{t('Sample')}</span></div>
                  {preview.targets.map((col) => {
                    const src = mapping[col.key];
                    const idx = src ? preview.headers.indexOf(src) : -1;
                    return (
                      <div key={col.key} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1.4fr] items-center gap-1.5 md:gap-2 px-3.5 py-2.5 border-b border-line last:border-b-0 text-[13.5px]">
                        <span className="inline-flex items-center gap-1.5 font-medium">{t(col.label)}{col.required && <span className="text-critical">*</span>}{col.description && <span className="text-[12px] text-ink-3 font-normal truncate">{t(col.description)}</span>}</span>
                        <Select compact className={clsx(col.required && !src && 'border-critical/60')} value={src ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [col.key]: e.target.value || null }))}>
                          <option value="">{t('— skip —')}</option>
                          {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                        </Select>
                        <span className="num text-ink-3 truncate text-[12.5px]">{idx >= 0 ? preview.sampleRows.slice(0, 3).map((r) => r[idx]).filter(Boolean).join(' · ') : ''}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-col md:flex-row md:items-end gap-4">
                  <Field label={t('Date format')} className="md:w-48"><Select compact value={dateFormat} onChange={(e) => setDateFormat(e.target.value as ImportDateFormat)}><option value="auto">{t('Auto-detect')}</option><option value="iso">{t('ISO (YYYY-MM-DD)')}</option><option value="dmy">{t('Day / Month / Year')}</option><option value="mdy">{t('Month / Day / Year')}</option></Select></Field>
                  <div className="flex flex-col gap-1">
                    <Checkbox label={t('Create missing categories')} checked={createCats} onChange={(e) => setCreateCats(e.target.checked)} />
                    <Checkbox label={t('Create missing stakeholders (0% share)')} checked={createSh} onChange={(e) => setCreateSh(e.target.checked)} />
                    <Checkbox label={t('Skip rows that already exist')} checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />
                  </div>
                </div>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <span className="text-[13px] text-ink-3">{missingRequired.length ? <span className="text-critical">{t('Map required fields: {fields}', { fields: missingRequired.map((col) => t(col.label)).join(', ') })}</span> : t('Ready to import.')}</span>
                  <Button variant="primary" size="md" icon={<Upload className="size-4" />} loading={busy} disabled={!!missingRequired.length} onClick={commit}>{t('Import {n} rows', { n: preview.rowCount })}</Button>
                </div>
                {result && (
                  <div className="rounded-[14px] bg-sunken/60 p-3.5 text-[13.5px]">
                    <div className="flex items-center gap-2 flex-wrap"><Badge tone="good">{t('{n} inserted', { n: result.inserted })}</Badge>{result.skipped > 0 && <Badge>{t('{n} skipped', { n: result.skipped })}</Badge>}{result.errors.length > 0 && <Badge tone="critical">{t('{n} errors', { n: result.errors.length })}</Badge>}</div>
                    {result.errors.length > 0 && (
                      <ul className="mt-2 max-h-40 overflow-y-auto space-y-0.5 num text-[12.5px] text-ink-2">
                        {result.errors.slice(0, 100).map((e, i) => <li key={i}><span className="text-ink-3">{t('row {n}', { n: e.row })}</span> {e.message}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
        <div className="space-y-4">
          <Card title={t('Export')} subtitle={t('Excel files keep the dropdowns, so they re-import without typos.')} flush>
            <ul className="divide-y divide-line">
              {IMPORT_ENTITIES.map((e) => {
                const params = e === 'stakeholders' || e === 'categories' ? undefined : { from: range.from, to: range.to };
                return (
                  <li key={e} className="flex items-center justify-between gap-2 px-4 md:px-5 h-13 text-[14px]">
                    <span className="min-w-0">{t(LABELS[e])}{params && <span className="block text-ink-3 num text-[12px]">{t('{from} → {to}', { from: range.from, to: range.to })}</span>}</span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <Button size="xs" variant="soft" className="rounded-full" icon={<Download className="size-3.5" />} onClick={() => downloadFile(`/export/${e}.xlsx`, `${e}.xlsx`, params).catch((err) => toast.error(t('Export failed'), errorMessage(err)))}>{t('Excel')}</Button>
                      <Button size="xs" variant="ghost" className="rounded-full" onClick={() => downloadFile(`/export/${e}.csv`, `${e}.csv`, params).catch((err) => toast.error(t('Export failed'), errorMessage(err)))}>{t('CSV')}</Button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card title={t('Backup & restore')}>
            <p className="text-[13.5px] text-ink-2 mb-3">{t('One JSON file with every table, custom field and rule. Keep one before big imports.')}</p>
            <div className="flex gap-2 flex-wrap">
              <Button variant="secondary" icon={<ShieldCheck className="size-4" />} onClick={() => downloadFile('/export/backup.json', 'ledgr-backup.json').catch((e) => toast.error(t('Backup failed'), errorMessage(e)))}>{t('Download backup')}</Button>
              <Button variant="ghost" icon={<Upload className="size-4" />} onClick={() => setRestoreOpen(true)}>{t('Restore…')}</Button>
            </div>
          </Card>
        </div>
      </div>
      <Modal open={restoreOpen} onClose={() => setRestoreOpen(false)} title={t('Restore from backup')} description={t('Restores a ledgr-backup.json. Only allowed into an empty project unless you choose to replace everything.')} footer={<><Button variant="ghost" size="md" onClick={() => setRestoreOpen(false)}>{t('Cancel')}</Button><Button variant={replace ? 'danger' : 'primary'} size="md" loading={busy} disabled={!restoreFile} onClick={restore}>{t(replace ? 'Replace all data' : 'Restore')}</Button></>}>
        <div className="space-y-3">
          <input type="file" accept="application/json,.json" onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)} className="text-[13.5px]" />
          <Checkbox label={t('Wipe current data first (irreversible)')} checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        </div>
      </Modal>
    </>
  );
}
