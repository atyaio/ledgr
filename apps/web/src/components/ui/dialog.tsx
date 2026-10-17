import { clsx } from 'clsx';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './button';
import { useIsMobile } from '@/lib/media';

interface BaseProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', h);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

/** Form container: a bottom sheet on phones, a right-side drawer on larger screens. */
export function Sheet({ open, onClose, title, description, children, footer, width = 480 }: BaseProps & { width?: number }) {
  useEscape(open, onClose);
  const mobile = useIsMobile();
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={clsx('fixed inset-0 z-50 flex', mobile ? 'items-end' : 'justify-end')} role="dialog" aria-modal>
          <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className={clsx('relative bg-card flex flex-col shadow-2xl', mobile ? 'w-full max-h-[94dvh] rounded-t-[24px]' : 'h-full border-l border-line')}
            style={mobile ? undefined : { width: `min(${width}px, 100vw)` }}
            initial={mobile ? { y: '100%' } : { x: 32, opacity: 0 }}
            animate={mobile ? { y: 0 } : { x: 0, opacity: 1 }}
            exit={mobile ? { y: '100%' } : { x: 32, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 40 }}
          >
            {mobile && <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line-strong" />}
            <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
              <div>
                <h2 className="text-[18px] font-semibold tracking-tight">{title}</h2>
                {description && <p className="text-[13px] text-ink-3 mt-0.5">{description}</p>}
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="text-ink-3 hover:text-ink -mr-2 -mt-1 size-9 inline-flex items-center justify-center rounded-full hover:bg-card-hover">
                <X className="size-5" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>
            {footer && <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-line safe-bottom bg-card">{footer}</footer>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Centered modal for confirmations & small content (bottom sheet on phones). */
export function Modal({ open, onClose, title, description, children, footer, width = 440 }: BaseProps & { width?: number }) {
  useEscape(open, onClose);
  const mobile = useIsMobile();
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={clsx('fixed inset-0 z-50 flex', mobile ? 'items-end' : 'items-center justify-center p-4')} role="dialog" aria-modal>
          <motion.div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className={clsx('relative bg-card shadow-2xl w-full', mobile ? 'rounded-t-[24px] max-h-[92dvh] flex flex-col' : 'rounded-[20px] border border-line')}
            style={mobile ? undefined : { maxWidth: width }}
            initial={mobile ? { y: '100%' } : { y: 8, opacity: 0, scale: 0.98 }}
            animate={mobile ? { y: 0 } : { y: 0, opacity: 1, scale: 1 }}
            exit={mobile ? { y: '100%' } : { y: 8, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 460, damping: 38 }}
          >
            {mobile && <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line-strong" />}
            <header className="px-5 pt-4 pb-2">
              <h2 className="text-[18px] font-semibold tracking-tight">{title}</h2>
              {description && <p className="text-[13.5px] text-ink-2 mt-1 leading-relaxed">{description}</p>}
            </header>
            <div className="px-5 pb-4 overflow-y-auto">{children}</div>
            {footer && <footer className={clsx('flex items-center justify-end gap-2 px-5 py-3 safe-bottom', mobile ? 'flex-col-reverse [&>*]:w-full' : 'border-t border-line')}>{footer}</footer>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Delete',
  danger = true,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} size="md" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <span />
    </Modal>
  );
}
