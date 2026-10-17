import { useCallback, useEffect, useState } from 'react';

export type Theme = 'system' | 'light' | 'dark';
const KEY = 'ledgr:theme';

function read(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function useTheme(): [Theme, (t: Theme) => void, 'light' | 'dark'] {
  const [theme, setThemeState] = useState<Theme>(read);
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      if (theme === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setResolved(theme === 'system' ? (mq.matches ? 'dark' : 'light') : theme);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [theme]);
  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  return [theme, setTheme, resolved];
}
