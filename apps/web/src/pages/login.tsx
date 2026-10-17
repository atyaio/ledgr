import { useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

export function LoginPage() {
  const { signIn, sendMagicLink, status, error: authError, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="h-full grid lg:grid-cols-[1.1fr_1fr] bg-bg">
      <section className="relative hidden lg:flex flex-col justify-between p-10 border-r border-line grid-paper overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(60% 50% at 20% 20%, var(--accent-soft), transparent 70%)' }} />
        <div className="relative">
          <span className="serif italic text-[40px] leading-none">ledgr</span>
        </div>
        <div className="relative max-w-md">
          <p className="eyebrow mb-3">Ledger · splits · settlements</p>
          <h1 className="text-[34px] leading-[1.05] tracking-[-0.025em] font-semibold">
            Every expense, every partner's share, <span className="serif italic font-normal text-accent">reconciled</span>.
          </h1>
          <p className="text-ink-2 mt-4 leading-relaxed text-[13.5px]">
            A self-contained finance dashboard for this project. Expenses and revenue in one ledger, split by ownership, with balances that always net to zero.
          </p>
        </div>
        <div className="relative num text-[11px] text-ink-3">
          <span className="blink">▍</span> secured by Supabase · admins only
        </div>
      </section>

      <section className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-[360px] fade-up">
          <div className="lg:hidden mb-8">
            <span className="serif italic text-[32px] leading-none">ledgr</span>
          </div>
          <h2 className="text-[20px] font-semibold tracking-tight">Sign in</h2>
          <p className="text-[12.5px] text-ink-3 mt-1 mb-6">Use the account the project owner created for you in Supabase.</p>

          {status === 'not-admin' && (
            <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-[12.5px] leading-relaxed">
              <strong className="font-semibold">Signed in, but not an admin.</strong> Ask the project owner to set <code className="num">app_metadata.role = "admin"</code> on your user (SQL on <code className="num">auth.users</code> in
              Supabase), then{' '}
              <button type="button" className="underline" onClick={() => window.location.reload()}>
                reload this page
              </button>
              . No need to sign out. Wrong account?{' '}
              <button type="button" className="underline" onClick={() => signOut()}>
                Sign out
              </button>
              .
            </div>
          )}
          {(error || (status === 'signed-out' && authError)) && <div className="mb-4 rounded-md border border-critical/40 bg-critical/10 p-3 text-[12.5px]">{error ?? authError}</div>}
          {sent && <div className="mb-4 rounded-md border border-good/40 bg-good/10 p-3 text-[12.5px]">Magic link sent. Check your inbox.</div>}

          <div className="space-y-3">
            <Field label="Email" required>
              <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
            </Field>
            <Field label="Password">
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </Field>
          </div>
          <div className="mt-5 flex items-center gap-2">
            <Button type="submit" variant="primary" size="md" className="flex-1" loading={busy} disabled={!email || !password}>
              Sign in
            </Button>
            <Button type="button" size="md" variant="outline" onClick={magic} disabled={!email || busy}>
              Magic link
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
