import { useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Logo } from '@/components/layout/shell';

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
    <div className="min-h-full flex items-center justify-center p-6 bg-bg">
      <form onSubmit={submit} className="w-full max-w-[380px] fade-up">
        <div className="flex items-center gap-3 mb-8">
          <Logo size={40} />
          <div>
            <div className="text-[20px] font-semibold tracking-tight leading-none">ledgr</div>
            <div className="text-[13px] text-ink-3 mt-1">Sign in to continue</div>
          </div>
        </div>

        {status === 'not-admin' && (
          <div className="mb-4 rounded-[14px] bg-warning/10 p-4 text-[13.5px] leading-relaxed">
            <strong className="font-semibold">Signed in, but not an admin.</strong> Ask the project owner to set <code className="mono text-[12.5px]">app_metadata.role = "admin"</code> on your user (SQL on <code className="mono text-[12.5px]">auth.users</code> in Supabase), then{' '}
            <button type="button" className="underline font-medium" onClick={() => window.location.reload()}>
              reload this page
            </button>
            . Wrong account?{' '}
            <button type="button" className="underline font-medium" onClick={() => signOut()}>
              Sign out
            </button>
            .
          </div>
        )}
        {(error || (status === 'signed-out' && authError)) && <div className="mb-4 rounded-[14px] bg-critical/10 p-4 text-[13.5px] text-critical">{error ?? authError}</div>}
        {sent && <div className="mb-4 rounded-[14px] bg-good/10 p-4 text-[13.5px]">Magic link sent. Check your inbox.</div>}

        <div className="card p-5 space-y-4">
          <Field label="Email" required>
            <Input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </Field>
          <Button type="submit" variant="primary" size="lg" full loading={busy} disabled={!email || !password}>
            Sign in
          </Button>
          <Button type="button" size="md" variant="ghost" full onClick={magic} disabled={!email || busy}>
            Email me a magic link instead
          </Button>
        </div>
        <p className="text-center text-[12.5px] text-ink-3 mt-5">Only admins of this project can sign in.</p>
      </form>
    </div>
  );
}
