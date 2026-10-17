import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';

type Tone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  description?: string;
}
interface ToastApi {
  toast: (t: Omit<Toast, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}
const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++seq.current;
    setItems((xs) => [...xs, { ...t, id }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), t.tone === 'error' ? 6500 : 3200);
  }, []);
  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, description) => toast({ tone: 'success', title, description }),
      error: (title, description) => toast({ tone: 'error', title, description }),
      info: (title, description) => toast({ tone: 'info', title, description }),
    }),
    [toast],
  );
  const icons = { success: <CheckCircle2 className="size-5 text-good" />, error: <AlertTriangle className="size-5 text-critical" />, info: <Info className="size-5 text-net" /> };
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="fixed top-3 inset-x-3 md:inset-x-auto md:top-auto md:bottom-5 md:right-5 z-[70] flex flex-col gap-2 md:w-[360px] pointer-events-none" style={{ paddingTop: 'var(--safe-top)' }}>
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              className="pointer-events-auto card px-4 py-3 flex gap-3 items-start shadow-[var(--shadow-pop)]"
            >
              <span className="mt-px">{icons[t.tone]}</span>
              <div className="min-w-0">
                <div className="text-[14px] font-medium leading-tight">{t.title}</div>
                {t.description && <div className="text-[12.5px] text-ink-3 mt-0.5 break-words">{t.description}</div>}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}

export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const msg = String((e as { message: unknown }).message);
    const details = (e as { details?: unknown }).details;
    if (Array.isArray(details) && details.length && typeof details[0] === 'object' && details[0] && 'message' in details[0]) {
      return `${msg}: ${details.map((d: { path?: unknown[]; message?: string }) => `${(d.path ?? []).join('.')} ${d.message ?? ''}`.trim()).join('; ')}`;
    }
    return msg;
  }
  return String(e);
}
