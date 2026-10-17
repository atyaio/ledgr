import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event('ledgr:installable'));
  });
}

export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(!!deferred);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const on = () => setCanInstall(true);
    const done = () => { setInstalled(true); setCanInstall(false); };
    window.addEventListener('ledgr:installable', on);
    window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('ledgr:installable', on); window.removeEventListener('appinstalled', done); };
  }, []);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    deferred = null;
    setCanInstall(false);
  };
  return { canInstall, install, installed, isIOS, isStandalone };
}
