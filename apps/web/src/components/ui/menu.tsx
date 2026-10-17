import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useIsMobile } from '@/lib/media';

interface Pos {
  top: number;
  left?: number;
  right?: number;
  up: boolean;
}

/**
 * Dropdown on desktop, bottom action sheet on phones. The desktop menu renders in a
 * portal with fixed positioning next to its trigger, so cards with `overflow:hidden`
 * never clip it; it flips upward when there is no room below.
 */
export function Menu({ trigger, children, align = 'right', className, title }: { trigger: (open: boolean) => ReactNode; children: ReactNode | ((close: () => void) => ReactNode); align?: 'left' | 'right'; className?: string; title?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobile = useIsMobile();

  useLayoutEffect(() => {
    if (!open || mobile) return;
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const menuH = menuRef.current?.offsetHeight ?? 200;
      const up = r.bottom + menuH + 12 > window.innerHeight && r.top > menuH + 12;
      setPos({
        top: up ? r.top - 6 : r.bottom + 6,
        ...(align === 'right' ? { right: Math.max(8, window.innerWidth - r.right) } : { left: Math.max(8, r.left) }),
        up,
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, mobile, align]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
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
    <div ref={triggerRef} className={clsx('relative inline-block', className)}>
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {createPortal(
        <AnimatePresence>
          {open &&
            (mobile ? (
              <div className="fixed inset-0 z-50 flex items-end" role="menu">
                <motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
                <motion.div ref={menuRef} className="relative w-full bg-card rounded-t-[24px] p-2 pb-[max(8px,var(--safe-bottom))] shadow-2xl" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 420, damping: 40 }}>
                  <div className="mx-auto mt-1 mb-2 h-1.5 w-10 rounded-full bg-line-strong" />
                  {title && <div className="px-3 pb-2 text-[13px] text-ink-3 font-medium">{title}</div>}
                  {body}
                </motion.div>
              </div>
            ) : (
              <div
                ref={menuRef}
                style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left, right: pos?.right, transform: pos?.up ? 'translateY(-100%)' : undefined, zIndex: 60, visibility: pos ? 'visible' : 'hidden' }}
                className="min-w-[200px] card p-1.5 shadow-[var(--shadow-pop)]"
                role="menu"
              >
                {body}
              </div>
            ))}
        </AnimatePresence>,
        document.body,
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
        'w-full flex items-center gap-3 h-11 md:h-9 px-3 rounded-[10px] text-start text-[15px] md:text-[13.5px] hover:bg-card-hover disabled:opacity-40 disabled:pointer-events-none',
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
