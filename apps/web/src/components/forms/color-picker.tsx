import { clsx } from 'clsx';
import { CATEGORICAL_PALETTE } from '@ledgr/shared';

export function ColorPicker({ value, onChange, label = 'Colour' }: { value: string; onChange: (c: string) => void; label?: string }) {
  return (
    <div>
      <span className="block mb-1 text-[12px] font-medium text-ink-2">{label}</span>
      <div className="flex items-center gap-1 h-8">
        {CATEGORICAL_PALETTE.map((c) => (
          <button key={c} type="button" aria-label={c} onClick={() => onChange(c)} className={clsx('size-5 rounded-full border-2 transition-transform hover:scale-110', value === c ? 'border-ink scale-110' : 'border-transparent')} style={{ background: c }} />
        ))}
        <label className="relative size-5 rounded-full border border-line-strong overflow-hidden cursor-pointer" title="Custom colour">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
          <span className="absolute inset-0" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }} />
        </label>
      </div>
    </div>
  );
}
