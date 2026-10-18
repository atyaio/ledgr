import { forwardRef, useEffect, useState, type InputHTMLAttributes } from 'react';
import { parseMoney } from '@atyaio/ledgr-shared';
import { useProject } from '@/lib/project';
import { Input } from '@/components/ui/input';

/** Text input that edits an integer minor-unit value while showing major units. */
export const MoneyInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number | null; onChange: (minor: number | null) => void; large?: boolean }>(
  function MoneyInput({ value, onChange, large, className, ...rest }, ref) {
    const { currency, toMajor, digits } = useProject();
    const [text, setText] = useState(value === null ? '' : toMajor(value).toFixed(digits));
    useEffect(() => {
      const current = parseMoney(text, currency);
      if (current !== value) setText(value === null ? '' : toMajor(value).toFixed(digits));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);
    return (
      <div className="relative" dir="ltr">
        <span className={`absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-3 font-medium pointer-events-none ${large ? 'text-[16px]' : 'text-[13px]'}`}>{currency}</span>
        <Input
          ref={ref}
          mono
          inputMode="decimal"
          className={`${large ? 'ps-16 h-14 text-[26px] font-semibold rounded-[14px]' : 'ps-14'} text-end ${className ?? ''}`}
          value={text}
          placeholder="0.00"
          onChange={(e) => {
            setText(e.target.value);
            onChange(parseMoney(e.target.value, currency));
          }}
          onBlur={() => {
            const m = parseMoney(text, currency);
            if (m !== null) setText(toMajor(m).toFixed(digits));
          }}
          {...rest}
        />
      </div>
    );
  },
);
