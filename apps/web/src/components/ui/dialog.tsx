import { clsx } from 'clsx';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './button';

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

/** Right-side drawer for forms. */
export function Sheet({ open, onClose, title, description, children, footer, width = 480 }: BaseProps & { width?: number }) {
  useEscape(open, onClose);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal>
          <motion.div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="relative h-full bg-panel border-l border-line shadow-2xl flex flex-col"
            style={{ width: `min(${width}px, 100vw)` }}
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          >
            <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 border-b border-line">
              <div>
                <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
                {description && <p className="text-[12px] text-ink-3 mt-0.5">{description}</p>}
              </div>
              <button onClick={onClose} aria-label="Close" className="text-ink-3 hover:text-ink -mr-1 p-1 rounded">
                <X className="size-4" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-line bg-sunken/40">{footer}</footer>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Centered modal for confirmations & small content. */
export function Modal({ open, onClose, title, description, children, footer, width = 440 }: BaseProps & { width?: number }) {
  useEscape(open, onClose);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal>
          <motion.div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="relative panel w-full"
            style={{ maxWidth: width }}
            initial={{ y: 8, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 8, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 460, damping: 36 }}
          >
            <header className="px-5 pt-4 pb-2">
              <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
              {description && <p className="text-[12.5px] text-ink-2 mt-1 leading-relaxed">{description}</p>}
            </header>
            <div className="px-5 pb-4">{children}</div>
            {footer && <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-line">{footer}</footer>}
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
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} className={clsx(danger && 'bg-critical/15')}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <span />
    </Modal>
  );
}
