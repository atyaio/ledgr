import { clsx } from 'clsx';
import { ArrowRight, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { POOL_ID, round2, type Settlement, type Stakeholder, type SuggestedTransfer } from '@ledgr/shared';
import { useDateRange } from '@/lib/range';
import { useProject } from '@/lib/project';
import { useBalances, useCustomFields, useDistribution, useSettlementMutations, useSettlements, useStakeholderMutations, useStakeholders } from '@/lib/queries';
import { pct } from '@/lib/format';
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
        title="Stakeholders"
        subtitle={sh.data ? <>{sh.data.items.filter((s) => s.active).length} active partners · ownership <span className={clsx('num font-medium', Math.abs(remaining) > 0.01 ? 'text-warning' : 'text-ink')}>{pct(shareTotal, 2)}</span></> : 'Loading…'}
        actions={
          <>
            <Button variant="secondary" size="sm" className="rounded-full" icon={<ArrowRight className="size-4" />} onClick={() => setSettling({ open: true })}>Record settlement</Button>
            <Button variant="primary" size="sm" className="rounded-full" icon={<Plus className="size-4" />} onClick={() => setEditing(null)}>New stakeholder</Button>
          </>
        }
      />
      {sh.data && Math.abs(remaining) > 0.01 && sh.data.items.length > 0 && (
        <div className="mb-4 rounded-[14px] bg-warning/10 px-4 py-3 text-[13.5px]">
          Ownership adds up to <span className="num font-medium">{pct(shareTotal, 2)}</span>. Splits use the active total, but you probably want 100%. {remaining > 0 ? `${remaining.toFixed(2)}% is unassigned.` : `It is ${Math.abs(remaining).toFixed(2)}% over.`}
        </div>
      )}
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ id: 'ownership', label: 'Ownership' }, { id: 'balances', label: 'Balances' }, { id: 'settlements', label: 'Settlements' }, { id: 'distribution', label: 'Profit' }]} />
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
      toast.success('Stakeholder removed');
      setConfirm(null);
      setForce(false);
      setDetail(null);
    } catch (e) {
      if ((e as { code?: string }).code === 'HAS_RECORDS') setForce(true);
      toast.error('Could not remove', errorMessage(e));
    }
  };

  return (
    <>
      {items.length > 0 && (
        <div className="card p-4 md:p-5 mb-4">
          <div className="label mb-2">Cap table</div>
          <div className="flex h-8 rounded-[10px] overflow-hidden bg-sunken gap-[2px]">
            {items.filter((s) => s.active && s.sharePercent > 0).map((s) => (
              <div key={s.id} className="h-full flex items-center justify-center text-[12px] font-semibold text-white overflow-hidden" style={{ width: `${(s.sharePercent / total) * 100}%`, background: s.color }} title={`${s.name} ${s.sharePercent}%`}>
                <span className="truncate px-1.5">{s.sharePercent >= 12 ? `${s.name.split(' ')[0]} ${s.sharePercent}%` : s.sharePercent >= 6 ? `${s.sharePercent}%` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <Card flush>
        {!items.length && <EmptyState title="No stakeholders yet" description="Add the partners and their ownership percentage." />}
        <ul className="divide-y divide-line">
          {items.map((s) => (
            <li key={s.id} className="flex items-center">
              <ListRow
                className="flex-1"
                leading={<Avatar name={s.name} color={s.color} size={40} />}
                title={<span className="inline-flex items-center gap-2">{s.name}{!s.active && <Badge>inactive</Badge>}</span>}
                subtitle={[s.email, s.joinedAt ? `since ${date(s.joinedAt)}` : null].filter(Boolean).join(' · ') || 'No contact details'}
                trailing={<span className="num text-[17px] font-semibold">{s.sharePercent.toFixed(s.sharePercent % 1 ? 2 : 0)}%</span>}
                onClick={() => setDetail(s)}
              />
              <div className="pr-3">
                <Menu trigger={() => <button type="button" className="size-9 inline-flex items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-card-hover" aria-label="Actions"><MoreHorizontal className="size-4" /></button>}>
                  {(close) => (<><MenuItem icon={<Pencil />} onClick={() => { close(); onEdit(s); }}>Edit</MenuItem><MenuSeparator /><MenuItem icon={<Trash2 />} danger onClick={() => { close(); setForce(false); setConfirm(s); }}>Remove</MenuItem></>)}
                </Menu>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.name ?? ''} description={detail ? `${detail.sharePercent}% ownership · ${detail.active ? 'active' : 'inactive'}` : ''}
        footer={detail && (<><Button variant="danger" size="md" onClick={() => { setForce(false); setConfirm(detail); }}>Remove</Button><Button variant="primary" size="md" onClick={() => { onEdit(detail); setDetail(null); }}>Edit</Button></>)}>
        {detail && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px]">
            <dt className="text-ink-3">Email</dt><dd>{detail.email ?? '—'}</dd>
            <dt className="text-ink-3">Joined</dt><dd>{detail.joinedAt ? date(detail.joinedAt) : '—'}</dd>
            {defs.map((d) => <span key={d.id} className="contents"><dt className="text-ink-3">{d.label}</dt><dd><CustomCell def={d} value={detail.customFields?.[d.key]} /></dd></span>)}
            {detail.notes && <><dt className="text-ink-3">Notes</dt><dd className="whitespace-pre-wrap">{detail.notes}</dd></>}
          </dl>
        )}
      </Modal>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={del} loading={remove.isPending} confirmLabel={force ? 'Remove anyway' : 'Remove'} title={`Remove ${confirm?.name}?`} description={force ? 'This stakeholder has expense splits, payments or settlements. Removing them deletes their split rows and un-assigns what they paid. Prefer marking them inactive.' : 'If they have history you will be asked to confirm again. Consider marking them inactive instead.'} />
    </>
  );
}

function BalancesTab({ onSettle }: { onSettle: (t: SuggestedTransfer) => void }) {
  const { range } = useDateRange();
  const { money } = useProject();
  const q = useBalances(range.from, range.to);
  if (q.isPending) return <Loading />;
  if (q.isError) return <EmptyState title="Could not load balances" description={q.error.message} />;
  const b = q.data;
  const maxAbs = Math.max(1, ...b.balances.map((x) => Math.abs(x.netMinor)));
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card className="xl:col-span-2" title="Who owes whom" subtitle={`Expenses ${money(b.totalExpenseMinor, { compact: true })} in this period · company paid ${money(b.poolPaidMinor, { compact: true })}`} flush>
        <ul className="divide-y divide-line">
          {b.balances.map((x) => (
            <li key={x.stakeholderId} className="px-4 md:px-5 py-3">
              <div className="flex items-center gap-3">
                {x.stakeholderId === POOL_ID ? <span className="size-10 rounded-full border border-dashed border-line-strong inline-flex items-center justify-center text-[12px] text-ink-3 shrink-0">Co</span> : <Avatar name={x.name} color={x.color} size={40} />}
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] font-medium truncate">{x.name}{x.stakeholderId !== POOL_ID && <span className="num text-[12.5px] text-ink-3 font-normal"> · {x.sharePercent}%</span>}</div>
                  <div className="text-[12.5px] text-ink-3 truncate">Share {money(x.owedMinor, { compact: true })} · paid {money(x.paidMinor, { compact: true })}{x.settledOutMinor || x.settledInMinor ? ` · settled ${money(x.settledOutMinor, { compact: true })} / ${money(x.settledInMinor, { compact: true })}` : ''}</div>
                </div>
                <div className="text-right shrink-0">
                  <Money minor={x.netMinor} tone="flow" signed className="text-[15px] font-semibold block" />
                  <span className="text-[11.5px] text-ink-3">{x.netMinor > 0 ? 'is owed' : x.netMinor < 0 ? 'owes' : 'settled'}</span>
                </div>
              </div>
              <div className="relative h-1.5 mt-2.5 ml-[52px]">
                <span className="absolute left-1/2 top-0 bottom-0 w-px bg-line-strong" />
                <span className={clsx('absolute top-0 bottom-0 rounded-full', x.netMinor >= 0 ? 'left-1/2 bg-good/70' : 'right-1/2 bg-critical/70')} style={{ width: `${(Math.abs(x.netMinor) / maxAbs) * 50}%` }} />
              </div>
            </li>
          ))}
        </ul>
        <p className="px-4 md:px-5 py-3 text-[12.5px] text-ink-3 border-t border-line">Net = paid − share of expenses + settlements paid − settlements received. The company row is the shared account. All rows sum to zero.</p>
      </Card>
      <Card title="Settle up" subtitle="Fewest transfers to clear everything" flush>
        {!b.suggestions.length ? <EmptyState title="All square" description="Nobody owes anyone for this period." /> : (
          <ul className="divide-y divide-line">
            {b.suggestions.map((t, i) => (
              <li key={i} className="px-4 md:px-5 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] flex items-center gap-1.5 min-w-0"><span className="font-medium truncate">{t.fromName}</span><ArrowRight className="size-4 text-ink-3 shrink-0" /><span className="font-medium truncate">{t.toName}</span></div>
                  <Money minor={t.amountMinor} className="text-[16px] font-semibold" />
                </div>
                <Button size="sm" variant="soft" className="rounded-full" onClick={() => onSettle(t)}>Record</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function SettlementsTab({ onEdit }: { onEdit: (s: Settlement) => void }) {
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
      {q.data && !q.data.items.length && <EmptyState title="No settlements" description="Record one from the Balances tab when a partner pays someone back." />}
      <ul className="divide-y divide-line">
        {q.data?.items.map((s) => (
          <li key={s.id} className="flex items-center">
            <ListRow
              className="flex-1"
              leading={s.from && <Avatar name={s.from.name} color={s.from.color} size={40} />}
              title={<span className="inline-flex items-center gap-1.5">{s.from?.name}<ArrowRight className="size-4 text-ink-3" />{s.to?.name ?? 'Company'}</span>}
              subtitle={[date(s.date), s.note].filter(Boolean).join(' · ')}
              trailing={<Money minor={s.amountMinor} className="text-[15px] font-semibold" />}
            />
            <div className="pr-3">
              <Menu trigger={() => <button type="button" className="size-9 inline-flex items-center justify-center rounded-full text-ink-3 hover:text-ink hover:bg-card-hover" aria-label="Actions"><MoreHorizontal className="size-4" /></button>}>
                {(close) => (<><MenuItem icon={<Pencil />} onClick={() => { close(); onEdit(s); }}>Edit</MenuItem><MenuSeparator /><MenuItem icon={<Trash2 />} danger onClick={() => { close(); setConfirm(s); }}>Delete</MenuItem></>)}
              </Menu>
            </div>
          </li>
        ))}
      </ul>
      {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(n) => setParams((p) => { const x = new URLSearchParams(p); x.set('page', String(n)); return x; }, { replace: true })} />}
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={async () => { try { await remove.mutateAsync(confirm!.id); toast.success('Settlement deleted'); setConfirm(null); } catch (e) { toast.error('Delete failed', errorMessage(e)); } }} loading={remove.isPending} title="Delete this settlement?" />
    </Card>
  );
}

function DistributionTab() {
  const { range } = useDateRange();
  const { money } = useProject();
  const q = useDistribution(range.from, range.to);
  if (q.isPending) return <Loading />;
  if (q.isError) return <EmptyState title="Could not load distribution" description={q.error.message} />;
  const d = q.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[{ l: 'Revenue', v: d.revenueMinor, signed: false }, { l: 'Expenses', v: d.expenseMinor, signed: false }, { l: 'Profit', v: d.profitMinor, signed: true }].map((x) => (
          <div key={x.l} className="card p-4"><div className="label">{x.l}</div><div className={clsx('num text-[18px] md:text-[22px] font-semibold mt-1 tracking-tight', x.signed && x.v < 0 && 'text-critical')}>{money(x.v, { signed: x.signed, compact: true })}</div></div>
        ))}
      </div>
      <Card title="Each partner's share" subtitle={`By current ownership · shares total ${pct(d.shareTotal, 2)}`} flush>
        <ul className="divide-y divide-line">
          {d.items.map((s) => (
            <li key={s.stakeholderId} className="px-4 md:px-5 py-3 flex items-center gap-3">
              <Avatar name={s.name} color={s.color} size={40} />
              <div className="flex-1 min-w-0">
                <div className="text-[14.5px] font-medium truncate">{s.name} <span className="num text-[12.5px] text-ink-3 font-normal">{s.sharePercent}%</span></div>
                <div className="text-[12.5px] text-ink-3 truncate">Revenue {money(s.revenueShareMinor, { compact: true })} · expenses {money(s.expenseShareMinor, { compact: true })}</div>
              </div>
              <div className="text-right"><Money minor={s.profitShareMinor} tone="flow" signed className="text-[15px] font-semibold block" /><span className="text-[11.5px] text-ink-3">profit share</span></div>
            </li>
          ))}
          {!d.items.length && <li><EmptyState title="No active stakeholders" /></li>}
        </ul>
        <p className="px-4 md:px-5 py-3 text-[12.5px] text-ink-3 border-t border-line">Uses current ownership shares for the selected period. Individual expense splits are snapshots and may differ if ownership changed.</p>
      </Card>
    </div>
  );
}
