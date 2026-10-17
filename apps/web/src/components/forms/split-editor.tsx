import { clsx } from 'clsx';
import { round2, splitAmount, type SplitMode, type Stakeholder } from '@ledgr/shared';
import { useProject } from '@/lib/project';
import { Segmented } from '@/components/ui/misc';
import { Avatar } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

export interface CustomSplit {
  stakeholderId: string;
  sharePercent: number;
}

export function SplitEditor({
  stakeholders,
  amountMinor,
  mode,
  onMode,
  splits,
  onSplits,
}: {
  stakeholders: Stakeholder[];
  amountMinor: number | null;
  mode: SplitMode;
  onMode: (m: SplitMode) => void;
  splits: CustomSplit[];
  onSplits: (s: CustomSplit[]) => void;
}) {
  const { money } = useProject();
  const active = stakeholders.filter((s) => s.active);
  const shares = mode === 'ownership' ? active.map((s) => ({ stakeholderId: s.id, sharePercent: s.sharePercent })) : splits;
  const preview = splitAmount(amountMinor ?? 0, shares);
  const total = round2(shares.reduce((a, s) => a + s.sharePercent, 0));
  const ok = mode === 'ownership' || Math.abs(total - 100) <= 0.01;

  const setPct = (id: string, v: number) => {
    const next = splits.some((s) => s.stakeholderId === id) ? splits.map((s) => (s.stakeholderId === id ? { ...s, sharePercent: v } : s)) : [...splits, { stakeholderId: id, sharePercent: v }];
    onSplits(next);
  };
  const equalize = () => onSplits(active.map((s) => ({ stakeholderId: s.id, sharePercent: round2(100 / active.length) })));

  return (
    <div className="rounded-md border border-line bg-sunken/60">
      <div className="flex items-center justify-between px-3 h-9 border-b border-line">
        <span className="eyebrow">Split between partners</span>
        <Segmented
          size="xs"
          value={mode}
          onChange={(m) => {
            onMode(m);
            if (m === 'custom' && splits.length === 0) onSplits(active.map((s) => ({ stakeholderId: s.id, sharePercent: s.sharePercent })));
          }}
          items={[
            { id: 'ownership', label: 'By ownership' },
            { id: 'custom', label: 'Custom' },
          ]}
        />
      </div>
      <ul className="divide-y divide-line/70">
        {active.map((s) => {
          const share = shares.find((x) => x.stakeholderId === s.id)?.sharePercent ?? 0;
          const amt = preview.find((p) => p.stakeholderId === s.id)?.amountMinor ?? 0;
          return (
            <li key={s.id} className="flex items-center gap-2.5 px-3 h-9 text-[12.5px]">
              <Avatar name={s.name} color={s.color} size={18} />
              <span className="flex-1 truncate">{s.name}</span>
              {mode === 'custom' ? (
                <span className="relative w-20">
                  <Input mono className="h-6.5 text-right pr-5 text-[12px]" type="number" step="0.01" min={0} max={100} value={share} onChange={(e) => setPct(s.id, Number(e.target.value))} />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10.5px] text-ink-3">%</span>
                </span>
              ) : (
                <span className="num text-ink-3 w-16 text-right">{share.toFixed(2)}%</span>
              )}
              <span className="num w-24 text-right">{money(amt)}</span>
            </li>
          );
        })}
        {!active.length && <li className="px-3 py-3 text-[12px] text-ink-3">No active stakeholders. Add partners first.</li>}
      </ul>
      <div className="flex items-center justify-between px-3 h-8 border-t border-line text-[11.5px]">
        <span className={clsx('num', ok ? 'text-ink-3' : 'text-critical')}>
          Total {total.toFixed(2)}% {ok ? '' : '— must equal 100%'}
        </span>
        {mode === 'custom' && (
          <button type="button" className="text-ink-3 hover:text-ink underline-offset-2 hover:underline" onClick={equalize}>
            Split equally
          </button>
        )}
      </div>
    </div>
  );
}
