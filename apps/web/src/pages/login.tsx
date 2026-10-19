import { useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Logo } from '@/components/layout/shell';
import { useI18n } from '@/i18n';
import { useBranding } from '@/lib/branding';

export function LoginPage() {
  const { signIn, sendMagicLink, status, error: authError, signOut } = useAuth();
  const { t } = useI18n();
  const { appName } = useBranding();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(await signIn(email, password));
    setBusy(false);
  };
  const magic = async () => {
    setBusy(true);
    const err = await sendMagicLink(email);
    setError(err);
    if (!err) setSent(true);
    setBusy(false);
  };

  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-bg">
      <form onSubmit={submit} className="w-full max-w-[380px] fade-up">
        <div className="flex items-center gap-3 mb-8">
          <Logo size={40} />
          <div>
            <div className="text-[20px] font-semibold tracking-tight leading-none">{appName}</div>
            <div className="text-[13px] text-ink-3 mt-1">{t('Sign in to continue')}</div>
          </div>
        </div>

        {status === 'not-admin' && (
          <div className="mb-4 rounded-[14px] bg-warning/10 p-4 text-[13.5px] leading-relaxed">
            <strong className="font-semibold">{t('Signed in, but not an admin.')}</strong> {t('Ask the project owner to set')} <code className="mono text-[12.5px]">app_metadata.role = "admin"</code> {t('on your user (SQL on')} <code className="mono text-[12.5px]">auth.users</code> {t('in Supabase), then')}{' '}
            <button type="button" className="underline font-medium" onClick={() => window.location.reload()}>
              {t('reload this page')}
            </button>
            . {t('Wrong account?')}{' '}
            <button type="button" className="underline font-medium" onClick={() => signOut()}>
              {t('Sign out')}
            </button>
            .
          </div>
        )}
        {(error || (status === 'signed-out' && authError)) && <div className="mb-4 rounded-[14px] bg-critical/10 p-4 text-[13.5px] text-critical">{error ?? authError}</div>}
        {sent && <div className="mb-4 rounded-[14px] bg-good/10 p-4 text-[13.5px]">{t('Magic link sent. Check your inbox.')}</div>}

        <div className="card p-5 space-y-4">
          <Field label={t('Email')} required>
            <Input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
          </Field>
          <Field label={t('Password')}>
            <div className="relative">
              <Input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pe-11" />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('Hide password') : t('Show password')}
                title={showPassword ? t('Hide password') : t('Show password')}
                className="absolute end-1 top-1/2 -translate-y-1/2 size-9 inline-flex items-center justify-center rounded-[9px] text-ink-3 hover:text-ink hover:bg-bg-sunken focus:outline-none focus-visible:ring-4 focus-visible:ring-accent/15 transition-colors"
              >
                {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
              </button>
            </div>
          </Field>
          <Button type="submit" variant="primary" size="lg" full loading={busy} disabled={!email || !password}>
            {t('Sign in')}
          </Button>
          <Button type="button" size="md" variant="ghost" full onClick={magic} disabled={!email || busy}>
            {t('Email me a magic link instead')}
          </Button>
        </div>
        <p className="text-center text-[12.5px] text-ink-3 mt-5">{t('Only admins of this project can sign in.')}</p>
      </form>
    </div>
  );
}
