import { clsx } from 'clsx';
import { ArrowRight, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { POOL_ID, round2, type Settlement, type Stakeholder, type SuggestedTransfer } from '@ledgr/shared';
import { useDateRange } from '@/lib/range';
import { useProject } from '@/lib/project';
import { useBalances, useCustomFields, useDistribution, useSettlementMutations, useSettlements, useStakeholderMutations, useStakeholders } from '@/lib/queries';
import { pct } from '@/lib/format';
import { StakeholderForm } from '@/components/forms/stakeholder-form';
import { SettlementForm } from '@/components/forms/settlement-form';
import { Button } from '@/components/ui/button';
import { EmptyState, Loading, PageHeader, Panel, Tabs } from '@/components/ui/misc';
import { EmptyRow, Pagination, Table, Td, Th, Tr } from '@/components/ui/table';
import { Money } from '@/components/ui/money';
import { Avatar, Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { errorMessage, useToast } from '@/components/ui/toast';
import { CustomCell } from '@/components/custom-cell';
import { useSearchParams } from 'react-router';

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
        subtitle={sh.data ? <>{sh.data.items.filter((s) => s.active).length} active · ownership totals <span className={clsx('num', Math.abs(remaining) > 0.01 ? 'text-warning' : 'text-ink')}>{pct(shareTotal, 2)}</span></> : 'Loading…'}
        actions={
          <>
            <Button variant="outline" icon={<ArrowRight className="size-3.5" />} onClick={() => setSettling({ open: true })}>Record settlement</Button>
            <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing(null)}>New stakeholder</Button>
          </>
        }
      />
      {sh.data && Math.abs(remaining) > 0.01 && sh.data.items.length > 0 && (
        <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12.5px]">
          Ownership adds up to <span className="num font-medium">{pct(shareTotal, 2)}</span>. Splits are normalised to the active total, but you probably want it to be 100%. {remaining > 0 ? `${remaining.toFixed(2)}% is unassigned.` : `It is ${Math.abs(remaining).toFixed(2)}% over.`}
        </div>
      )}
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ id: 'ownership', label: 'Ownership' }, { id: 'balances', label: 'Balances' }, { id: 'settlements', label: 'Settlements' }, { id: 'distribution', label: 'Distribution' }]} />
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
    } catch (e) {
      if ((e as { code?: string }).code === 'HAS_RECORDS') setForce(true);
      toast.error('Could not remove', errorMessage(e));
    }
  };

  return (
    <>
      <div className="panel mb-4 p-4">
        <div className="eyebrow mb-2">Cap table</div>
        <div className="flex h-6 rounded-md overflow-hidden bg-sunken gap-[2px]">
          {items.filter((s) => s.active && s.sharePercent > 0).map((s) => (
            <div key={s.id} className="h-full flex items-center justify-center text-[10.5px] font-semibold text-black/80 overflow-hidden" style={{ width: `${(s.sharePercent / total) * 100}%`, background: s.color }} title={`${s.name} ${s.sharePercent}%`}>
              <span className="truncate px-1">{s.sharePercent >= 8 ? `${s.name.split(' ')[0]} ${s.sharePercent}%` : ''}</span>
            </div>
          ))}
        </div>
      </div>
      <Panel>
        <Table>
          <thead>
            <tr>
              <Th>Partner</Th>
              <Th align="right">Share</Th>
              <Th>Status</Th>
              <Th>Email</Th>
              <Th>Joined</Th>
              {defs.map((d) => <Th key={d.id}>{d.label}</Th>)}
              <Th>Notes</Th>
              <Th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {!items.length && <EmptyRow colSpan={8 + defs.length}>No stakeholders yet. Add the partners and their ownership percentage.</EmptyRow>}
            {items.map((s) => (
              <Tr key={s.id}>
                <Td><span className="inline-flex items-center gap-2"><Avatar name={s.name} color={s.color} /><span className="font-medium">{s.name}</span></span></Td>
                <Td align="right" className="num font-medium">{s.sharePercent.toFixed(2)}%</Td>
                <Td>{s.active ? <Badge tone="good">active</Badge> : <Badge>inactive</Badge>}</Td>
                <Td className="text-ink-2">{s.email ?? <span className="text-ink-4">—</span>}</Td>
                <Td className="num text-ink-2">{s.joinedAt ? date(s.joinedAt) : <span className="text-ink-4">—</span>}</Td>
                {defs.map((d) => <Td key={d.id}><CustomCell def={d} value={s.customFields?.[d.key]} /></Td>)}
                <Td className="text-ink-3 truncate max-w-[220px]">{s.notes}</Td>
                <Td>
                  <Menu trigger={() => <button className="size-6 inline-flex items-center justify-center rounded text-ink-3 hover:text-ink hover:bg-hover" aria-label="Actions"><MoreHorizontal className="size-3.5" /></button>}>
                    {(close) => (<><MenuItem icon={<Pencil />} onClick={() => { close(); onEdit(s); }}>Edit</MenuItem><MenuSeparator /><MenuItem icon={<Trash2 />} danger onClick={() => { close(); setForce(false); setConfirm(s); }}>Remove</MenuItem></>)}
                  </Menu>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Panel>
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
    <div className="grid grid-cols-12 gap-4">
      <Panel className="col-span-12 xl:col-span-8" title="Who owes whom" eyebrow="net" actions={<span className="eyebrow">expenses {money(b.totalExpenseMinor, { compact: true })} · pool paid {money(b.poolPaidMinor, { compact: true })}</span>}>
        <Table>
          <thead>
            <tr>
              <Th>Party</Th>
              <Th align="right">Share of expenses</Th>
              <Th align="right">Paid out</Th>
              <Th align="right">Settled</Th>
              <Th align="right">Net</Th>
              <Th className="w-[180px]" />
            </tr>
          </thead>
          <tbody>
            {b.balances.map((x) => (
              <Tr key={x.stakeholderId}>
                <Td><span className="inline-flex items-center gap-2">{x.stakeholderId === POOL_ID ? <span className="size-[22px] rounded-full border border-dashed border-line-strong inline-flex items-center justify-center text-[10px] text-ink-3">∅</span> : <Avatar name={x.name} color={x.color} />}<span className="font-medium">{x.name}</span>{x.stakeholderId !== POOL_ID && <span className="num text-[11px] text-ink-3">{x.sharePercent}%</span>}</span></Td>
                <Td align="right"><Money minor={x.owedMinor} muted /></Td>
                <Td align="right"><Money minor={x.paidMinor} /></Td>
                <Td align="right" className="num text-ink-2">{x.settledOutMinor || x.settledInMinor ? <>{money(x.settledOutMinor)} <span className="text-ink-4">/</span> {money(x.settledInMinor)}</> : <span className="text-ink-4">—</span>}</Td>
                <Td align="right"><Money minor={x.netMinor} tone="flow" signed className="font-medium" /></Td>
                <Td>
                  <div className="relative h-2 w-full">
                    <span className="absolute left-1/2 top-0 bottom-0 w-px bg-line-strong" />
                    <span className={clsx('absolute top-0 bottom-0 rounded-sm', x.netMinor >= 0 ? 'left-1/2 bg-good/70' : 'right-1/2 bg-critical/70')} style={{ width: `${(Math.abs(x.netMinor) / maxAbs) * 50}%` }} />
                  </div>
                </Td>
              </Tr>
            ))}
            {!b.balances.length && <EmptyRow colSpan={6}>No stakeholders.</EmptyRow>}
          </tbody>
        </Table>
        <p className="px-4 py-2.5 text-[11.5px] text-ink-3 border-t border-line">Net = paid − share of expenses + settlements paid − settlements received. Positive means the partner is owed money; the pool is the company account. All rows sum to zero.</p>
      </Panel>
      <Panel className="col-span-12 xl:col-span-4" title="Suggested transfers" eyebrow="settle">
        {!b.suggestions.length ? <EmptyState title="All square" description="Nobody owes anyone for this range." /> : (
          <ul className="divide-y divide-line/70">
            {b.suggestions.map((t, i) => (
              <li key={i} className="px-4 py-3 flex items-center gap-3 text-[12.5px]">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5"><span className="font-medium truncate">{t.fromName}</span><ArrowRight className="size-3.5 text-ink-3 shrink-0" /><span className="font-medium truncate">{t.toName}</span></div>
                  <Money minor={t.amountMinor} className="text-[14px]" />
                </div>
                <Button size="xs" variant="outline" onClick={() => onSettle(t)}>Record</Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
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
    <Panel>
      <Table>
        <thead><tr><Th className="w-24">Date</Th><Th>From</Th><Th>To</Th><Th>Note</Th><Th align="right">Amount</Th><Th className="w-10" /></tr></thead>
        <tbody>
          {q.isPending && <EmptyRow colSpan={6}>Loading…</EmptyRow>}
          {q.data && !q.data.items.length && <EmptyRow colSpan={6}>No settlements in this range.</EmptyRow>}
          {q.data?.items.map((s) => (
            <Tr key={s.id}>
              <Td className="num text-ink-2">{date(s.date)}</Td>
              <Td>{s.from && <span className="inline-flex items-center gap-1.5"><Avatar name={s.from.name} color={s.from.color} size={18} />{s.from.name}</span>}</Td>
              <Td>{s.to ? <span className="inline-flex items-center gap-1.5"><Avatar name={s.to.name} color={s.to.color} size={18} />{s.to.name}</span> : <span className="text-ink-3">Company pool</span>}</Td>
              <Td className="text-ink-2 truncate max-w-[300px]">{s.note}</Td>
              <Td align="right"><Money minor={s.amountMinor} className="font-medium" /></Td>
              <Td>
                <Menu trigger={() => <button className="size-6 inline-flex items-center justify-center rounded text-ink-3 hover:text-ink hover:bg-hover" aria-label="Actions"><MoreHorizontal className="size-3.5" /></button>}>
                  {(close) => (<><MenuItem icon={<Pencil />} onClick={() => { close(); onEdit(s); }}>Edit</MenuItem><MenuSeparator /><MenuItem icon={<Trash2 />} danger onClick={() => { close(); setConfirm(s); }}>Delete</MenuItem></>)}
                </Menu>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(n) => setParams((p) => { const x = new URLSearchParams(p); x.set('page', String(n)); return x; }, { replace: true })} />}
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={async () => { try { await remove.mutateAsync(confirm!.id); toast.success('Settlement deleted'); setConfirm(null); } catch (e) { toast.error('Delete failed', errorMessage(e)); } }} loading={remove.isPending} title="Delete this settlement?" />
    </Panel>
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
      <div className="panel grid grid-cols-3 divide-x divide-line">
        {[{ l: 'Revenue', v: d.revenueMinor }, { l: 'Expenses', v: d.expenseMinor }, { l: 'Profit to distribute', v: d.profitMinor }].map((x) => (
          <div key={x.l} className="p-4"><div className="eyebrow">{x.l}</div><div className={clsx('num text-[20px] font-medium mt-1', x.l.startsWith('Profit') && x.v < 0 && 'text-critical')}>{money(x.v, { signed: x.l.startsWith('Profit') })}</div></div>
        ))}
      </div>
      <Panel title="By ownership share" eyebrow="live" actions={<span className="eyebrow">shares total {pct(d.shareTotal, 2)}</span>}>
        <Table>
          <thead><tr><Th>Partner</Th><Th align="right">Share</Th><Th align="right">Revenue share</Th><Th align="right">Expense share</Th><Th align="right">Profit share</Th></tr></thead>
          <tbody>
            {d.items.map((s) => (
              <Tr key={s.stakeholderId}>
                <Td><span className="inline-flex items-center gap-2"><Avatar name={s.name} color={s.color} /><span className="font-medium">{s.name}</span></span></Td>
                <Td align="right" className="num text-ink-2">{s.sharePercent.toFixed(2)}%</Td>
                <Td align="right"><Money minor={s.revenueShareMinor} /></Td>
                <Td align="right"><Money minor={s.expenseShareMinor} muted /></Td>
                <Td align="right"><Money minor={s.profitShareMinor} tone="flow" signed className="font-medium" /></Td>
              </Tr>
            ))}
            {!d.items.length && <EmptyRow colSpan={5}>No active stakeholders.</EmptyRow>}
          </tbody>
        </Table>
        <p className="px-4 py-2.5 text-[11.5px] text-ink-3 border-t border-line">Distribution uses <em>current</em> ownership shares for the selected range. Expense splits on individual entries are snapshots and may differ if ownership changed.</p>
      </Panel>
    </div>
  );
}
