import { clsx } from 'clsx';
import { round2, splitAmount, type SplitMode, type Stakeholder } from '@ledgr/shared';
import { useProject } from '@/lib/project';
import { Segmented } from '@/components/ui/misc';
import { Avatar } from '@/components/ui/badge';

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
    <div className="rounded-[14px] border border-line overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-sunken/60">
        <span className="text-[13px] font-medium text-ink-2">Split</span>
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
      <ul className="divide-y divide-line">
        {active.map((s) => {
          const share = shares.find((x) => x.stakeholderId === s.id)?.sharePercent ?? 0;
          const amt = preview.find((p) => p.stakeholderId === s.id)?.amountMinor ?? 0;
          return (
            <li key={s.id} className="flex items-center gap-3 px-3.5 h-12 text-[14px]">
              <Avatar name={s.name} color={s.color} size={26} />
              <span className="flex-1 truncate">{s.name}</span>
              {mode === 'custom' ? (
                <span className="relative w-[84px]">
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    value={share}
                    onChange={(e) => setPct(s.id, Number(e.target.value))}
                    className="num w-full h-9 rounded-[10px] border border-line-strong bg-card pl-2 pr-6 text-right text-[14px] focus:border-accent focus:outline-none"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-ink-3">%</span>
                </span>
              ) : (
                <span className="num text-ink-3 w-16 text-right text-[13px]">{share.toFixed(share % 1 ? 2 : 0)}%</span>
              )}
              <span className="num w-24 text-right font-medium">{money(amt)}</span>
            </li>
          );
        })}
        {!active.length && <li className="px-3.5 py-3 text-[13px] text-ink-3">No active stakeholders yet. Add partners first.</li>}
      </ul>
      <div className="flex items-center justify-between px-3.5 h-9 border-t border-line text-[12.5px]">
        <span className={clsx('num', ok ? 'text-ink-3' : 'text-critical font-medium')}>
          Total {total.toFixed(2)}% {ok ? '' : '— must equal 100%'}
        </span>
        {mode === 'custom' && (
          <button type="button" className="text-accent font-medium" onClick={equalize}>
            Split equally
          </button>
        )}
      </div>
    </div>
  );
}
