import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useIsMobile } from '@/lib/media';

/** Dropdown on desktop, bottom action sheet on phones. */
export function Menu({ trigger, children, align = 'right', className, title }: { trigger: (open: boolean) => ReactNode; children: ReactNode | ((close: () => void) => ReactNode); align?: 'left' | 'right'; className?: string; title?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mobile = useIsMobile();
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    if (!mobile) document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k);
    };
  }, [open, mobile]);
  const close = () => setOpen(false);
  const body = typeof children === 'function' ? children(close) : children;
  return (
    <div ref={ref} className={clsx('relative inline-block', className)}>
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {mobile
        ? createPortal(
            <AnimatePresence>
              {open && (
                <div className="fixed inset-0 z-50 flex items-end" role="menu">
                  <motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
                  <motion.div className="relative w-full bg-card rounded-t-[24px] p-2 pb-[max(8px,var(--safe-bottom))] shadow-2xl" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 420, damping: 40 }}>
                    <div className="mx-auto mt-1 mb-2 h-1.5 w-10 rounded-full bg-line-strong" />
                    {title && <div className="px-3 pb-2 text-[13px] text-ink-3 font-medium">{title}</div>}
                    {body}
                  </motion.div>
                </div>
              )}
            </AnimatePresence>,
            document.body,
          )
        : (
            <AnimatePresence>
              {open && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                  className={clsx('absolute z-40 mt-1.5 min-w-[200px] card p-1.5 shadow-[var(--shadow-pop)]', align === 'right' ? 'right-0' : 'left-0')}
                  role="menu"
                >
                  {body}
                </motion.div>
              )}
            </AnimatePresence>
          )}
    </div>
  );
}

export function MenuItem({ children, onClick, danger, icon, disabled }: { children: ReactNode; onClick?: () => void; danger?: boolean; icon?: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-3 h-11 md:h-9 px-3 rounded-[10px] text-left text-[15px] md:text-[13.5px] hover:bg-card-hover disabled:opacity-40 disabled:pointer-events-none',
        danger ? 'text-critical' : 'text-ink',
      )}
    >
      {icon && <span className="text-ink-3 [&>svg]:size-[18px] md:[&>svg]:size-4">{icon}</span>}
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-line" />;
}
