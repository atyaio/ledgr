import { clsx } from 'clsx';
import { AlertTriangle, Check, Download, ExternalLink, Plug, RefreshCw, Search, Store, Unplug } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { LoyverseIntegration, PosItem } from '@ledgr/shared';
import { useCategories, useLoyverse, useLoyverseItems, useLoyverseMutations, usePaymentMethods } from '@/lib/queries';
import { useProject } from '@/lib/project';
import { useIsMobile } from '@/lib/media';
import { relativeTime } from '@/lib/format';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card, EmptyState, Loading, PageHeader } from '@/components/ui/misc';
import { Badge, Swatch } from '@/components/ui/badge';
import { Checkbox, Field, Input, Select } from '@/components/ui/input';
import { ConfirmDialog, Modal } from '@/components/ui/dialog';
import { EmptyRow, Table, Td, Th, Tr } from '@/components/ui/table';
import { errorMessage, useToast } from '@/components/ui/toast';
import { PullShiftSheet } from '@/components/integrations/pull-shift-sheet';

const TOKENS_URL = 'https://r.loyverse.com/dashboard/#/integrations/tokens';

export function IntegrationsPage() {
  const { t } = useI18n();
  const q = useLoyverse();
  const [connecting, setConnecting] = useState(false);
  return (
    <>
      <PageHeader title={t('Integrations')} subtitle={t('Pull data from the systems your business already runs on.')} />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <EmptyState title={t('Could not load integrations')} description={q.error.message} />
      ) : q.data.connected ? (
        <LoyverseConnected i={q.data} onReconnect={() => setConnecting(true)} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-2">
            <div className="flex items-start gap-4 py-2">
              <LoyverseMark />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap"><h3 className="text-[17px] font-semibold tracking-tight">Loyverse</h3><Badge>{t('Point of sale')}</Badge></div>
                <p className="text-[13.5px] text-ink-2 mt-1 max-w-[52ch]">{t('Keep the item catalogue in sync and turn each closed shift into a revenue row with one tap, cash only by default.')}</p>
                <div className="mt-4"><Button variant="primary" icon={<Plug className="size-4" />} onClick={() => setConnecting(true)}>{t('Connect Loyverse')}</Button></div>
              </div>
            </div>
          </Card>
          <Card title={t('How it works')}>
            <ol className="text-[13.5px] text-ink-2 space-y-2 list-decimal ps-4">
              <li>{t('Create an access token in the Loyverse Back Office and paste it here.')}</li>
              <li>{t('Sync items to see the catalogue with its categories.')}</li>
              <li>{t('On the Revenue page, tap “Pull last shift” after closing the till.')}</li>
            </ol>
          </Card>
        </div>
      )}
      <ConnectSheet open={connecting} onClose={() => setConnecting(false)} />
    </>
  );
}

function LoyverseMark() {
  return (
    <span className="size-12 rounded-[14px] bg-[#1e9e6a]/12 text-[#1e9e6a] inline-flex items-center justify-center shrink-0 font-bold text-[18px] tracking-tight select-none" aria-hidden>
      L
    </span>
  );
}

function ConnectSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const { connect } = useLoyverseMutations();
  const [token, setToken] = useState('');
  useEffect(() => {
    if (open) setToken('');
  }, [open]);
  const submit = async () => {
    try {
      const r = await connect.mutateAsync({ accessToken: token.trim() });
      toast.success(t('Connected to {name}', { name: r.merchantName ?? 'Loyverse' }), t('{stores} stores · {types} payment types', { stores: r.stores.length, types: r.paymentTypes.length }));
      onClose();
    } catch (e) {
      toast.error(t('Could not connect'), errorMessage(e));
    }
  };
  const valid = token.trim().length >= 10;
  return (
    <Modal open={open} onClose={onClose} title={t('Connect Loyverse')} description={t('A personal access token gives ledgr read access to this Loyverse account.')} width={480}
      footer={<><Button variant="ghost" size="md" onClick={onClose}>{t('Cancel')}</Button><Button variant="primary" size="md" onClick={submit} loading={connect.isPending} disabled={!valid}>{t('Connect')}</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) submit(); }}>
        <Field label={t('Access token')} required hint={<a className="inline-flex items-center gap-1 text-accent" href={TOKENS_URL} target="_blank" rel="noreferrer">{t('Back Office → Integrations → Access tokens')} <ExternalLink className="size-3" /></a>}>
          <Input mono autoFocus value={token} onChange={(e) => setToken(e.target.value)} placeholder="fMYgxHEYtcyT8cvtvgi1Za5DRs4vArSy…" autoComplete="off" spellCheck={false} />
        </Field>
        <p className="text-[12.5px] text-ink-3">{t('The token is stored in this project’s database only. Its currency must match the project currency.')}</p>
      </form>
    </Modal>
  );
}

function LoyverseConnected({ i, onReconnect }: { i: LoyverseIntegration; onReconnect: () => void }) {
  const { t, name } = useI18n();
  const { locale } = useProject();
  const toast = useToast();
  const { syncItems, disconnect, settings } = useLoyverseMutations();
  const cats = useCategories('revenue');
  const pm = usePaymentMethods(true);
  const [confirm, setConfirm] = useState(false);
  const [pulling, setPulling] = useState(false);

  // Settings form (saved explicitly so a half-ticked list never hits the API).
  const [storeIds, setStoreIds] = useState<string[]>(i.settings.storeIds);
  const [typeIds, setTypeIds] = useState<string[]>(i.settings.paymentTypeIds);
  const [methodMap, setMethodMap] = useState<Record<string, string>>(i.settings.methodMap);
  const [categoryId, setCategoryId] = useState<string>(i.settings.categoryId ?? '');
  useEffect(() => {
    setStoreIds(i.settings.storeIds);
    setTypeIds(i.settings.paymentTypeIds);
    setMethodMap(i.settings.methodMap);
    setCategoryId(i.settings.categoryId ?? '');
  }, [i.settings]);
  const effectiveTypes = typeIds.length ? typeIds : i.paymentTypes.filter((p) => p.type === 'CASH').map((p) => p.id);
  const dirty = JSON.stringify({ storeIds, typeIds, methodMap, categoryId }) !== JSON.stringify({ storeIds: i.settings.storeIds, typeIds: i.settings.paymentTypeIds, methodMap: i.settings.methodMap, categoryId: i.settings.categoryId ?? '' });
  const save = async () => {
    try {
      await settings.mutateAsync({ storeIds, paymentTypeIds: effectiveTypes, methodMap, categoryId: categoryId || null });
      toast.success(t('Integration settings saved'));
    } catch (e) {
      toast.error(t('Could not save'), errorMessage(e));
    }
  };
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const methods = (pm.data?.items ?? []).filter((m) => !m.archived);

  return (
    <div className="space-y-4">
      {i.lastError && (
        <div className="card px-4 py-3 flex items-start gap-3 border-warning/40">
          <AlertTriangle className="size-5 text-warning shrink-0 mt-0.5" />
          <div className="min-w-0 text-[13.5px]"><span className="font-medium">{t('Last Loyverse call failed')}</span><div className="text-ink-3 break-words">{i.lastError}</div></div>
        </div>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <div className="flex items-start gap-4 py-1">
            <LoyverseMark />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[17px] font-semibold tracking-tight truncate">{i.merchantName ?? 'Loyverse'}</h3>
                <Badge tone="good"><Check className="size-3" /> {t('Connected')}</Badge>
                {i.currency && <Badge>{i.currency}</Badge>}
              </div>
              <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-[12.5px]">
                <Stat label={t('Stores')} value={String(i.stores.length)} />
                <Stat label={t('Items')} value={String(i.itemCount)} sub={i.lastItemsSyncAt ? t('synced {when}', { when: relativeTime(i.lastItemsSyncAt, locale) }) : t('not synced yet')} />
                <Stat label={t('Categories')} value={String(i.categoryCount)} />
                <Stat label={t('Shifts pulled')} value={String(i.shiftCount)} sub={i.lastShiftPullAt ? t('last {when}', { when: relativeTime(i.lastShiftPullAt, locale) }) : undefined} />
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" icon={<RefreshCw className={clsx('size-4', syncItems.isPending && 'animate-spin')} />} loading={syncItems.isPending} onClick={async () => { try { const r = await syncItems.mutateAsync(); toast.success(t('Items synced'), t('{items} items · {categories} categories{removed}', { items: r.items, categories: r.categories, removed: r.removed ? ` · ${t('{n} removed', { n: r.removed })}` : '' })); } catch (e) { toast.error(t('Sync failed'), errorMessage(e)); } }}>{t('Sync items')}</Button>
                <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => setPulling(true)}>{t('Pull last shift')}</Button>
                <Button variant="ghost" onClick={onReconnect}>{t('Replace token')}</Button>
                <Button variant="ghost" className="text-critical" icon={<Unplug className="size-4" />} onClick={() => setConfirm(true)}>{t('Disconnect')}</Button>
              </div>
            </div>
          </div>
        </Card>

        <Card title={t('Shift pulls')} subtitle={t('What goes on the revenue row')} actions={dirty ? <Button size="xs" variant="primary" loading={settings.isPending} onClick={save}>{t('Save')}</Button> : undefined}>
          <div className="space-y-4">
            <div>
              <div className="label mb-1.5">{t('Payment types to pull')}</div>
              <ul className="space-y-1.5">
                {i.paymentTypes.map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <Checkbox label={<span>{p.name} <span className="text-ink-3 text-[12px]">{p.type === 'CASH' ? t('cash') : p.type === 'NONINTEGRATEDCARD' ? t('card') : p.type.toLowerCase()}</span></span>} checked={effectiveTypes.includes(p.id)} onChange={() => setTypeIds(toggle(effectiveTypes, p.id))} />
                    {effectiveTypes.includes(p.id) && (
                      <Select compact className="ms-auto w-[150px]" value={methodMap[p.id] ?? ''} onChange={(e) => setMethodMap(() => { const next = { ...methodMap }; if (e.target.value) next[p.id] = e.target.value; else delete next[p.id]; return next; })} title={t('ledgr payment method')}>
                        <option value="">{t('→ “{name}” (auto)', { name: p.name })}</option>
                        {methods.map((m) => <option key={m.id} value={m.id}>→ {name(m)}</option>)}
                      </Select>
                    )}
                  </li>
                ))}
                {!i.paymentTypes.length && <li className="text-[13px] text-ink-3">{t('No payment types found in Loyverse.')}</li>}
              </ul>
              <p className="text-[12px] text-ink-3 mt-1.5">{t('Unticked types stay in Loyverse (shown on the shift, not added to the ledger).')}</p>
            </div>
            {i.stores.length > 1 && (
              <div>
                <div className="label mb-1.5">{t('Stores')}</div>
                <ul className="space-y-1.5">
                  {i.stores.map((s) => <li key={s.id}><Checkbox label={s.name} checked={!storeIds.length || storeIds.includes(s.id)} onChange={() => setStoreIds(storeIds.length ? toggle(storeIds, s.id) : i.stores.filter((x) => x.id !== s.id).map((x) => x.id))} /></li>)}
                </ul>
              </div>
            )}
            <Field label={t('Revenue category')} hint={t('for the shift rows')}>
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">{t('Default category')}</option>
                {(cats.data?.items ?? []).filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{name(c)}</option>)}
              </Select>
            </Field>
          </div>
        </Card>
      </div>

      <Catalogue i={i} />

      <PullShiftSheet open={pulling} onClose={() => setPulling(false)} />
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} loading={disconnect.isPending} title={t('Disconnect Loyverse?')} description={t('The token and the cached catalogue are removed. Revenue rows already pulled stay in the ledger.')} onConfirm={async () => { try { await disconnect.mutateAsync(); setConfirm(false); toast.success(t('Loyverse disconnected')); } catch (e) { toast.error(t('Failed'), errorMessage(e)); } }} />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-3">{label}</dt>
      <dd className="num text-[15px] font-semibold text-ink">{value}{sub && <span className="block num text-[11.5px] font-normal text-ink-3 truncate">{sub}</span>}</dd>
    </div>
  );
}

function Catalogue({ i }: { i: LoyverseIntegration }) {
  const { t } = useI18n();
  const { money } = useProject();
  const mobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const h = setTimeout(() => setDebounced(search.trim()), 200);
    return () => clearTimeout(h);
  }, [search]);
  const q = useLoyverseItems(useMemo(() => ({ q: debounced || undefined, categoryId: cat || undefined }), [debounced, cat]));
  const items: PosItem[] = q.data?.items ?? [];
  const categories = q.data?.categories.filter((c) => !c.deletedAt) ?? [];
  if (!i.itemCount && !q.data?.total && !debounced && !cat) {
    return (
      <Card flush>
        <EmptyState icon={<Store />} title={t('No items yet')} description={t('Sync items to see the Loyverse catalogue here with its categories, prices and costs.')} />
      </Card>
    );
  }
  return (
    <Card
      title={t('Items')}
      subtitle={q.data ? t('{n} items in {c} categories', { n: q.data.total, c: categories.length }) : undefined}
      flush
      actions={
        <div className="flex items-center gap-2">
          <Select compact value={cat} onChange={(e) => setCat(e.target.value)} className="w-[150px]">
            <option value="">{t('All categories')}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.itemCount})</option>)}
            <option value="none">{t('Uncategorised')}</option>
          </Select>
          <div className="relative">
            <Search className="size-4 absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
            <Input compact value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search items')} className="ps-8 w-[160px] md:w-[220px]" />
          </div>
        </div>
      }
    >
      {mobile ? (
        <ul className="divide-y divide-line">
          {items.map((it) => (
            <li key={it.id} className="px-4 py-3 flex items-center gap-3">
              <Swatch color={colorOf(it.category?.color)} size={10} />
              <div className="flex-1 min-w-0">
                <div dir="auto" className="text-[14.5px] font-medium truncate">{it.name}</div>
                <div className="text-[12.5px] text-ink-3 truncate">{it.category?.name ?? t('Uncategorised')}{it.sku ? ` · ${it.sku}` : ''}{it.variantCount > 1 ? ` · ${t('{n} variants', { n: it.variantCount })}` : ''}</div>
              </div>
              <div className="text-end num text-[14px]">{it.priceMinor !== null ? money(it.priceMinor) : <span className="text-ink-4">—</span>}</div>
            </li>
          ))}
          {!items.length && <li className="px-4 py-8 text-center text-[13px] text-ink-3">{t('No items match.')}</li>}
        </ul>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t('Item')}</Th>
              <Th>{t('Category')}</Th>
              <Th>{t('SKU')}</Th>
              <Th align="right">{t('Price')}</Th>
              <Th align="right">{t('Cost')}</Th>
              <Th align="right">{t('Margin')}</Th>
            </tr>
          </thead>
          <tbody>
            {q.isPending && <EmptyRow colSpan={6}>{t('Loading…')}</EmptyRow>}
            {!q.isPending && !items.length && <EmptyRow colSpan={6}>{t('No items match.')}</EmptyRow>}
            {items.map((it) => {
              const margin = it.priceMinor && it.costMinor !== null ? ((it.priceMinor - it.costMinor) / it.priceMinor) * 100 : null;
              return (
                <Tr key={it.id}>
                  <Td><div dir="auto" className="font-medium truncate max-w-[360px]">{it.name}</div>{it.variantCount > 1 && <div className="text-[12px] text-ink-3">{t('{n} variants', { n: it.variantCount })}</div>}</Td>
                  <Td>{it.category ? <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2"><Swatch color={colorOf(it.category.color)} />{it.category.name}</span> : <span className="text-ink-4">—</span>}</Td>
                  <Td className="mono text-[12.5px] text-ink-2">{it.sku ?? <span className="text-ink-4">—</span>}</Td>
                  <Td align="right" className="num">{it.priceMinor !== null ? money(it.priceMinor) : <span className="text-ink-4">—</span>}</Td>
                  <Td align="right" className="num text-ink-2">{it.costMinor !== null ? money(it.costMinor) : <span className="text-ink-4">—</span>}</Td>
                  <Td align="right" className={clsx('num', margin !== null && margin < 0 && 'text-critical')}>{margin === null ? <span className="text-ink-4">—</span> : `${Math.round(margin)}%`}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

/** Loyverse names colours (GREY, RED, PINK, ORANGE, YELLOW, GREEN, BLUE, PURPLE); map them to hexes. */
function colorOf(c: string | null | undefined): string {
  const map: Record<string, string> = { GREY: '#9aa0ab', RED: '#e5484d', PINK: '#e93d82', ORANGE: '#f76b15', YELLOW: '#f5b400', GREEN: '#30a46c', BLUE: '#3e63dd', PURPLE: '#8e4ec6' };
  return (c && map[c.toUpperCase()]) || 'var(--s-other)';
}
