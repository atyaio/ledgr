import { clsx } from 'clsx';
import { ArrowRight, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { POOL_ID, round2, type Settlement, type Stakeholder, type SuggestedTransfer } from '@ledgr/shared';
import { useDateRange } from '@/lib/range';
import { useProject } from '@/lib/project';
import { useBalances, useCustomFields, useDistribution, useSettlementMutations, useSettlements, useStakeholderMutations, useStakeholders } from '@/lib/queries';
import { pct } from '@/lib/format';
import { useI18n } from '@/i18n';
import { StakeholderForm } from '@/components/forms/stakeholder-form';
import { SettlementForm } from '@/components/forms/settlement-form';
import { Button } from '@/components/ui/button';
import { EmptyState, Loading, PageHeader, Card, Tabs, ListRow } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/table';
import { Money } from '@/components/ui/money';
import { Avatar, Badge } from '@/components/ui/badge';
import { ConfirmDialog, Modal } from '@/components/ui/dialog';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { errorMessage, useToast } from '@/components/ui/toast';
import { CustomCell } from '@/components/custom-cell';

type Tab = 'ownership' | 'balances' | 'settlements' | 'distribution';

export function StakeholdersPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'ownership';
  const setTab = (t: Tab) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', t); n.delete('page'); return n; }, { replace: true });
  const sh = useStakeholders();
  const [editing, setEditing] = useState<Stakeholder | null | undefined>(undefined);
  const [settling, setSettling] = useState<{ open: boolean; settlement?: Settlement | null; prefill?: SuggestedTransfer | null }>({ open: false });
  const shareTotal = sh.data?.shareTotal ?? 0;
  const remaining = round2(100 - shareTotal);

  return (
    <>
      <PageHeader
        title={t('Stakeholders')}
        subtitle={sh.data ? <>{t('{n} active partners', { n: sh.data.items.filter((s) => s.active).length })} · {t('ownership')} <span className={clsx('num font-medium', Math.abs(remaining) > 0.01 ? 'text-warning' : 'text-ink')}>{pct(shareTotal, 2)}</span></> : t('Loading…')}
        actions={
          <>
            <Button variant="secondary" size="sm" className="rounded-full" icon={<ArrowRight className="size-4 rtl-flip" />} onClick={() => setSettling({ open: true })}>{t('Record settlement')}</Button>
            <Button variant="primary" size="sm" className="rounded-full" icon={<Plus className="size-4" />} onClick={() => setEditing(null)}>{t('New stakeholder')}</Button>
          </>
        }
      />
      {sh.data && Math.abs(remaining) > 0.01 && sh.data.items.length > 0 && (
        <div className="mb-4 rounded-[14px] bg-warning/10 px-4 py-3 text-[13.5px]">
          {t('Ownership adds up to')} <span className="num font-medium">{pct(shareTotal, 2)}</span>. {t('Splits use the active total, but you probably want 100%.')} {remaining > 0 ? t('{pct}% is unassigned.', { pct: remaining.toFixed(2) }) : t('It is {pct}% over.', { pct: Math.abs(remaining).toFixed(2) })}
        </div>
      )}
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ id: 'ownership', label: t('Ownership') }, { id: 'balances', label: t('Balances') }, { id: 'settlements', label: t('Settlements') }, { id: 'distribution', label: t('Profit') }]} />
      {tab === 'ownership' && <OwnershipTab onEdit={(s) => setEditing(s)} />}
      {tab === 'balances' && <BalancesTab onSettle={(t) => setSettling({ open: true, prefill: t })} />}
      {tab === 'settlements' && <SettlementsTab onEdit={(s) => setSettling({ open: true, settlement: s })} />}
      {tab === 'distribution' && <DistributionTab />}
      <StakeholderForm open={editing !== undefined} onClose={() => setEditing(undefined)} stakeholder={editing ?? null} suggestedShare={editing === null ? Math.max(0, remaining) : undefined} />
      <SettlementForm open={settling.open} onClose={() => setSettling({ open: false })} settlement={settling.settlement} prefill={settling.prefill} />
    </>
  );
}

function OwnershipTab({ onEdit }: { onEdit: (s: Stakeholder) => void }) {
  const { t, name, label } = useI18n();
  const sh = useStakeholders();
  const cf = useCustomFields('stakeholder');
  const { remove } = useStakeholderMutations();
  const toast = useToast();
  const { date } = useProject();
  const [confirm, setConfirm] = useState<Stakeholder | null>(null);
  const [force, setForce] = useState(false);
  const [detail, setDetail] = useState<Stakeholder | null>(null);
  const defs = cf.data?.items ?? [];
  if (sh.isPending) return <Loading />;
  const items = sh.data?.items ?? [];
  const total = Math.max(sh.data?.shareTotal ?? 0, 100);

  const del = async () => {
    if (!confirm) return;
    try {
      await remove.mutateAsync({ id: confirm.id, force });
      toast.success(t('Stakeholder removed'));
      setConfirm(null);
      setForce(false);
      setDetail(null);
    } catch (e) {
      if ((e as { code?: string }).code === 'HAS_RECORDS') setForce(true);
      toast.error(t('Could not remove'), errorMessage(e));
    }
  };

  return (
    <>
      {items.length > 0 && (
        <div className="card p-4 md:p-5 mb-4">
          <div className="label mb-2">{t('Cap table')}</div>
          <div className="flex h-8 rounded-[10px] overflow-hidden bg-sunken gap-[2px]">
            {items.filter((s) => s.active && s.sharePercent > 0).map((s) => (
              <div key={s.id} className="h-full flex items-center justify-center text-[12px] font-semibold text-white overflow-hidden" style={{ width: `${(s.sharePercent / total) * 100}%`, background: s.color }} title={`${name(s)} ${s.sharePercent}%`}>
                <span className="truncate px-1.5">{s.sharePercent >= 12 ? `${name(s).split(' ')[0]} ${s.sharePercent}%` : s.sharePercent >= 6 ? `${s.sharePercent}%` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <Card flush>
        {!items.length && <EmptyState title={t('No stakeholders yet')} description={t('Add the partners and their ownership percentage.')} />}
        <ul className="divide-y divide-line">
          {items.map((s) => (
            <li key={s.id} className="flex items-center">
              <ListRow
                className="flex-1"
                leading={<Avatar name={name(s)} color={s.color} size={40} />}
                title={<span className="inline-flex items-center gap-2">{name(s)}{!s.active && <Badge>{t('inactive')}</Badge>}</span>}
                subtitle={[s.email, s.joinedAt ? t('since {date}', { date: date(s.joinedAt) }) : null].filter(Boolean).join(' · ') || t('No contact details')}
                trailing={<span className="num text-[17px] font-semibold">{s.sharePercent.toFixed(s.sharePercent % 1 ? 2 : 0)}%</span>}
                onClick={() => setDetail(s)}
              />
              <div className="pe-3">
                <Menu trigger={() => <button type="button" className="size-9 inline-flex items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-card-hover" aria-label={t('Actions')}><MoreHorizontal className="size-4" /></button>}>
                  {(close) => (<><MenuItem icon={<Pencil />} onClick={() => { close(); onEdit(s); }}>{t('Edit')}</MenuItem><MenuSeparator /><MenuItem icon={<Trash2 />} danger onClick={() => { close(); setForce(false); setConfirm(s); }}>{t('Remove')}</MenuItem></>)}
                </Menu>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? name(detail) : ''} description={detail ? `${t('{pct}% ownership', { pct: detail.sharePercent })} · ${detail.active ? t('active') : t('inactive')}` : ''}
        footer={detail && (<><Button variant="danger" size="md" onClick={() => { setForce(false); setConfirm(detail); }}>{t('Remove')}</Button><Button variant="primary" size="md" onClick={() => { onEdit(detail); setDetail(null); }}>{t('Edit')}</Button></>)}>
        {detail && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px]">
            <dt className="text-ink-3">{t('Email')}</dt><dd>{detail.email ?? '—'}</dd>
            <dt className="text-ink-3">{t('Joined')}</dt><dd>{detail.joinedAt ? date(detail.joinedAt) : '—'}</dd>
            {defs.map((d) => <span key={d.id} className="contents"><dt className="text-ink-3">{label(d)}</dt><dd><CustomCell def={d} value={detail.customFields?.[d.key]} /></dd></span>)}
            {detail.notes && <><dt className="text-ink-3">{t('Notes')}</dt><dd className="whitespace-pre-wrap">{detail.notes}</dd></>}
          </dl>
        )}
      </Modal>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={del} loading={remove.isPending} confirmLabel={force ? t('Remove anyway') : t('Remove')} title={t('Remove {name}?', { name: confirm ? name(confirm) : '' })} description={force ? t('This stakeholder has expense splits, payments or settlements. Removing them deletes their split rows and un-assigns what they paid. Prefer marking them inactive.') : t('If they have history you will be asked to confirm again. Consider marking them inactive instead.')} />
    </>
  );
}

function BalancesTab({ onSettle }: { onSettle: (t: SuggestedTransfer) => void }) {
  const { t, name } = useI18n();
  const { range } = useDateRange();
  const { money } = useProject();
  const q = useBalances(range.from, range.to);
  if (q.isPending) return <Loading />;
  if (q.isError) return <EmptyState title={t('Could not load balances')} description={q.error.message} />;
  const b = q.data;
  const maxAbs = Math.max(1, ...b.balances.map((x) => Math.abs(x.netMinor)));
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card className="xl:col-span-2" title={t('Who owes whom')} subtitle={t('Expenses {total} in this period · company paid {pool}', { total: money(b.totalExpenseMinor, { compact: true }), pool: money(b.poolPaidMinor, { compact: true }) })} flush>
        <ul className="divide-y divide-line">
          {b.balances.map((x) => (
            <li key={x.stakeholderId} className="px-4 md:px-5 py-3">
              <div className="flex items-center gap-3">
                {x.stakeholderId === POOL_ID ? <span className="size-10 rounded-full border border-dashed border-line-strong inline-flex items-center justify-center text-[12px] text-ink-3 shrink-0">{t('Co')}</span> : <Avatar name={name(x)} color={x.color} size={40} />}
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] font-medium truncate">{x.stakeholderId === POOL_ID ? t(x.name) : name(x)}{x.stakeholderId !== POOL_ID && <span className="num text-[12.5px] text-ink-3 font-normal"> · {x.sharePercent}%</span>}</div>
                  <div className="text-[12.5px] text-ink-3 truncate">{t('Share {share} · paid {paid}', { share: money(x.owedMinor, { compact: true }), paid: money(x.paidMinor, { compact: true }) })}{x.settledOutMinor || x.settledInMinor ? ` · ${t('settled {out} / {in}', { out: money(x.settledOutMinor, { compact: true }), in: money(x.settledInMinor, { compact: true }) })}` : ''}</div>
                </div>
                <div className="text-end shrink-0">
                  <Money minor={x.netMinor} tone="flow" signed className="text-[15px] font-semibold block" />
                  <span className="text-[11.5px] text-ink-3">{x.netMinor > 0 ? t('is owed') : x.netMinor < 0 ? t('owes') : t('settled')}</span>
                </div>
              </div>
              <div className="relative h-1.5 mt-2.5 ms-[52px]">
                <span className="absolute left-1/2 top-0 bottom-0 w-px bg-line-strong" />
                <span className={clsx('absolute top-0 bottom-0 rounded-full', x.netMinor >= 0 ? 'left-1/2 bg-good/70' : 'right-1/2 bg-critical/70')} style={{ width: `${(Math.abs(x.netMinor) / maxAbs) * 50}%` }} />
              </div>
            </li>
          ))}
        </ul>
        <p className="px-4 md:px-5 py-3 text-[12.5px] text-ink-3 border-t border-line">{t('Net = paid − share of expenses + settlements paid − settlements received. The company row is the shared account. All rows sum to zero.')}</p>
      </Card>
      <Card title={t('Settle up')} subtitle={t('Fewest transfers to clear everything')} flush>
        {!b.suggestions.length ? <EmptyState title={t('All square')} description={t('Nobody owes anyone for this period.')} /> : (
          <ul className="divide-y divide-line">
            {b.suggestions.map((tr, i) => (
              <li key={i} className="px-4 md:px-5 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] flex items-center gap-1.5 min-w-0"><span className="font-medium truncate">{tr.fromStakeholderId === POOL_ID ? t(tr.fromName) : name({ name: tr.fromName, nameAr: tr.fromNameAr })}</span><ArrowRight className="size-4 text-ink-3 shrink-0 rtl-flip" /><span className="font-medium truncate">{tr.toStakeholderId === POOL_ID ? t(tr.toName) : name({ name: tr.toName, nameAr: tr.toNameAr })}</span></div>
                  <Money minor={tr.amountMinor} className="text-[16px] font-semibold" />
                </div>
                <Button size="sm" variant="soft" className="rounded-full" onClick={() => onSettle(tr)}>{t('Record')}</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function SettlementsTab({ onEdit }: { onEdit: (s: Settlement) => void }) {
  const { t, name } = useI18n();
  const { range } = useDateRange();
  const { date } = useProject();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? '1') || 1;
  const q = useSettlements(useMemo(() => ({ from: range.from, to: range.to, page, pageSize: 50 }), [range, page]));
  const { remove } = useSettlementMutations();
  const toast = useToast();
  const [confirm, setConfirm] = useState<Settlement | null>(null);
  return (
    <Card flush>
      {q.isPending && <Loading />}
      {q.data && !q.data.items.length && <EmptyState title={t('No settlements')} description={t('Record one from the Balances tab when a partner pays someone back.')} />}
      <ul className="divide-y divide-line">
        {q.data?.items.map((s) => (
          <li key={s.id} className="flex items-center">
            <ListRow
              className="flex-1"
              leading={s.from && <Avatar name={name(s.from)} color={s.from.color} size={40} />}
              title={<span className="inline-flex items-center gap-1.5">{s.from ? name(s.from) : ''}<ArrowRight className="size-4 text-ink-3 rtl-flip" />{s.to ? name(s.to) : t('Company')}</span>}
              subtitle={[date(s.date), s.note].filter(Boolean).join(' · ')}
              trailing={<Money minor={s.amountMinor} className="text-[15px] font-semibold" />}
            />
            <div className="pe-3">
              <Menu trigger={() => <button type="button" className="size-9 inline-flex items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-card-hover" aria-label={t('Actions')}><MoreHorizontal className="size-4" /></button>}>
                {(close) => (<><MenuItem icon={<Pencil />} onClick={() => { close(); onEdit(s); }}>{t('Edit')}</MenuItem><MenuSeparator /><MenuItem icon={<Trash2 />} danger onClick={() => { close(); setConfirm(s); }}>{t('Delete')}</MenuItem></>)}
              </Menu>
            </div>
          </li>
        ))}
      </ul>
      {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(n) => setParams((p) => { const x = new URLSearchParams(p); x.set('page', String(n)); return x; }, { replace: true })} />}
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={async () => { try { await remove.mutateAsync(confirm!.id); toast.success(t('Settlement deleted')); setConfirm(null); } catch (e) { toast.error(t('Delete failed'), errorMessage(e)); } }} loading={remove.isPending} title={t('Delete this settlement?')} />
    </Card>
  );
}

function DistributionTab() {
  const { t, name } = useI18n();
  const { range } = useDateRange();
  const { money } = useProject();
  const q = useDistribution(range.from, range.to);
  if (q.isPending) return <Loading />;
  if (q.isError) return <EmptyState title={t('Could not load distribution')} description={q.error.message} />;
  const d = q.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[{ l: 'Revenue', v: d.revenueMinor, signed: false }, { l: 'Expenses', v: d.expenseMinor, signed: false }, { l: 'Profit', v: d.profitMinor, signed: true }].map((x) => (
          <div key={x.l} className="card p-4"><div className="label">{t(x.l)}</div><div className={clsx('num text-[18px] md:text-[22px] font-semibold mt-1 tracking-tight', x.signed && x.v < 0 && 'text-critical')}>{money(x.v, { signed: x.signed, compact: true })}</div></div>
        ))}
      </div>
      <Card title={t("Each partner's share")} subtitle={t('By current ownership · shares total {pct}', { pct: pct(d.shareTotal, 2) })} flush>
        <ul className="divide-y divide-line">
          {d.items.map((s) => (
            <li key={s.stakeholderId} className="px-4 md:px-5 py-3 flex items-center gap-3">
              <Avatar name={name(s)} color={s.color} size={40} />
              <div className="flex-1 min-w-0">
                <div className="text-[14.5px] font-medium truncate">{name(s)} <span className="num text-[12.5px] text-ink-3 font-normal">{s.sharePercent}%</span></div>
                <div className="text-[12.5px] text-ink-3 truncate">{t('Revenue {rev} · expenses {exp}', { rev: money(s.revenueShareMinor, { compact: true }), exp: money(s.expenseShareMinor, { compact: true }) })}</div>
              </div>
              <div className="text-end"><Money minor={s.profitShareMinor} tone="flow" signed className="text-[15px] font-semibold block" /><span className="text-[11.5px] text-ink-3">{t('profit share')}</span></div>
            </li>
          ))}
          {!d.items.length && <li><EmptyState title={t('No active stakeholders')} /></li>}
        </ul>
        <p className="px-4 md:px-5 py-3 text-[12.5px] text-ink-3 border-t border-line">{t('Uses current ownership shares for the selected period. Individual expense splits are snapshots and may differ if ownership changed.')}</p>
      </Card>
    </div>
  );
}
