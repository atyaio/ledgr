import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthConfigResponse, MeResponse } from '@ledgr/shared';
import { ApiRequestError, api, configureApi } from './api';

export type AuthStatus = 'loading' | 'signed-out' | 'not-admin' | 'ready' | 'error';

interface AuthState {
  status: AuthStatus;
  mode: AuthConfigResponse['mode'] | null;
  user: MeResponse | null;
  error: string | null;
  supabase: SupabaseClient | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  sendMagicLink: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AuthConfigResponse | null>(null);
  /** Who supabase-js currently has a session for: undefined = not restored yet, null = signed out. */
  const [sessionUserId, setSessionUserId] = useState<string | null | undefined>(undefined);
  const [user, setUser] = useState<MeResponse | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  /** Bumped on every successful password / magic-link sign-in so /me re-runs even when the same user signs in again. */
  const [signInCount, setSignInCount] = useState(0);

  const supabase = useMemo(() => {
    if (!config || config.mode !== 'supabase' || !config.supabaseUrl || !config.supabaseAnonKey) return null;
    return createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { storageKey: 'ledgr:auth' } });
  }, [config]);

  // 1. Load auth config
  useEffect(() => {
    api
      .get<AuthConfigResponse>('/auth/config')
      .then(setConfig)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Cannot reach the ledgr API');
        setStatus('error');
      });
  }, []);

  // 2. Wire the API token getter + listen to the session
  useEffect(() => {
    if (!config) return;
    if (config.mode === 'none') {
      configureApi({ getToken: () => null });
      api
        .get<MeResponse>('/me')
        .then((me) => {
          setUser(me);
          setStatus('ready');
        })
        .catch(() => setStatus('error'));
      return;
    }
    if (!supabase) return;
    configureApi({
      getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
      // The API rejected a token supabase-js still considers valid (revoked session, project changed, ...):
      // drop the local session so the user lands on the login page and a fresh sign-in re-runs /me.
      onUnauthorized: () => void supabase.auth.signOut({ scope: 'local' }),
    });
    // Track the signed-in user, not the session object: TOKEN_REFRESHED yields a new session for the same
    // user every hour and must not re-run /me (which would unmount the dashboard while "loading").
    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      setSessionUserId(s?.user.id ?? null);
      if (evt === 'SIGNED_IN') setSignInCount((n) => n + 1); // also covers magic-link landings
    });
    return () => sub.subscription.unsubscribe();
  }, [config, supabase]);

  // 3. Resolve /me whenever the signed-in user changes (sign-in, sign-out, account switch)
  useEffect(() => {
    if (!config || config.mode !== 'supabase') return;
    if (sessionUserId === undefined) return; // INITIAL_SESSION not delivered yet
    if (sessionUserId === null) {
      setUser(null);
      setStatus('signed-out');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    api
      .get<MeResponse>('/me')
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiRequestError && e.code === 'NOT_ADMIN') setStatus('not-admin');
        else if (e instanceof ApiRequestError && e.status === 401) setStatus('signed-out'); // onUnauthorized already dropped the session
        else {
          setError(e instanceof Error ? e.message : 'Sign-in failed');
          setStatus('signed-out');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [config, sessionUserId, signInCount]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      mode: config?.mode ?? null,
      user,
      error,
      supabase,
      signIn: async (email, password) => {
        if (!supabase) return 'Auth is not configured';
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error?.message ?? null;
      },
      sendMagicLink: async (email) => {
        if (!supabase) return 'Auth is not configured';
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
        return error?.message ?? null;
      },
      signOut: async () => {
        // Revoke the session server-side when we can; always clear it locally so the UI never gets stuck signed in.
        const { error } = (await supabase?.auth.signOut()) ?? {};
        if (error) await supabase?.auth.signOut({ scope: 'local' });
        setSessionUserId(null);
      },
    }),
    [status, config, user, error, supabase],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
