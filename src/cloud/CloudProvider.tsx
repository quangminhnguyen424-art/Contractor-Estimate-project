import type { User } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { termsFrom } from '@/engine/contract';
import { useApp } from '@/store/AppContext';
import { celebrate } from '@/ui/celebrate';
import { notify } from '@/ui/notify';

import { callFunction, supabase } from './client';
import { cloudConfigured } from './config';
import { fetchNewSignatures, markApplied, signedHtml, toSignature } from './sign';
import { decide } from './decide';
import { backupPhotos, loadMeta, pullWorkspace, pushWorkspace, restorePhotos, saveMeta } from './sync';

export type SyncState = 'off' | 'syncing' | 'ok' | 'error';

interface CloudCtx {
  configured: boolean;
  user: User | null;
  state: SyncState;
  lastSync: string | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<string | null>;
  syncNow: () => Promise<void>;
  backupNow: (onProgress?: (done: number, total: number) => void) => Promise<number>;
}

const Ctx = createContext<CloudCtx | null>(null);

/** Quotes and change orders signed from a link: recorded like a signature on this phone, once. */
async function applySignatures(uid: string, a: ReturnType<typeof useApp>) {
  const signed = await fetchNewSignatures(uid);
  for (const r of signed) {
    const est = a.estimates.find((e) => e.id === r.estimate_id);
    if (!est || !a.profile) { await markApplied(r.id); continue; }
    const sig = toSignature(r);
    if (r.kind === 'quote') {
      const html = signedHtml(r, sig, a.profile);
      const prof = a.profile;
      a.updateContract(est.id, (c) => (c.accepted ? c : { ...c, accepted: { ...sig, total: Number(r.total), html: { en: html } }, terms: c.terms ?? termsFrom(est, prof) }));
      if (est.status !== 'won') a.updateEstimate(est.id, { status: 'won' });
      a.emit('quote.signed', { estimate: { id: est.id, title: est.title, client: est.clientName, total: est.total }, signedBy: sig.name, signedAt: sig.signedAt });
      notify('Signed online', `${sig.name} signed “${est.title}”. The job is marked Won.`);
    } else if (r.change_id) {
      a.updateContract(est.id, (c) => ({
        ...c, changeOrders: c.changeOrders.map((co) => (co.id === r.change_id && co.status === 'pending' ? { ...co, status: 'approved', decidedAt: sig.signedAt, signature: sig } : co)),
      }));
      notify('Change order signed', `${sig.name} approved a change order on “${est.title}”.`);
    }
    celebrate();
    await markApplied(r.id);
  }
}

const device = `${Platform.OS} ${String(Platform.Version ?? '')}`.trim();

/** Signs in to Bidwell cloud, keeps data and photos in step, and records quotes clients signed online. */
export function CloudProvider({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const { ready, changedAt, snapshot, replaceFromCloud } = app;
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<SyncState>('off');
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const appRef = useRef(app);
  useEffect(() => { appRef.current = app; });

  useEffect(() => {
    if (!cloudConfigured) return;
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null)).catch(() => {});
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  /** One full sync: decide which side wins, move the data, then photos and online signatures. */
  const sync = useCallback(async (uid: string) => {
    if (busy.current) return;
    busy.current = true;
    setState('syncing');
    try {
      const meta = await loadMeta();
      const remote = await pullWorkspace(uid);
      const local = snapshot();
      const localChange = appRef.current.changedAt;
      const action = decide({ uid, meta, remote, localChange, localEmpty: !local.profile });
      if (action === 'pull' && remote) {
        if (replaceFromCloud(remote.data)) {
          await saveMeta({ uid, remoteAt: remote.updatedAt, syncedChange: Date.now() });
          restorePhotos(uid, snapshot()).catch(() => {});
        }
      } else if (action === 'push') {
        const at = await pushWorkspace(uid, local, device);
        await saveMeta({ uid, remoteAt: at, syncedChange: localChange });
        backupPhotos(uid, local).catch(() => {});
      } else if (remote) {
        await saveMeta({ uid, remoteAt: remote.updatedAt, syncedChange: localChange });
      }
      await applySignatures(uid, appRef.current);
      setLastSync(new Date().toISOString());
      setError(null);
      setState('ok');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
      setState('error');
    } finally {
      busy.current = false;
    }
  }, [snapshot, replaceFromCloud]);


  // Sync when signed in and the app's data is loaded, when the app comes back to the front, and every few minutes.
  useEffect(() => {
    if (!user || !ready) return;
    const first = setTimeout(() => sync(user.id), 0);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') sync(user.id); });
    const t = setInterval(() => sync(user.id), 3 * 60 * 1000);
    return () => { clearTimeout(first); sub.remove(); clearInterval(t); };
  }, [user, ready, sync]);

  // Local changes go up a few seconds after typing stops.
  useEffect(() => {
    if (!user || !ready || !changedAt) return;
    const t = setTimeout(() => sync(user.id), 4000);
    return () => clearTimeout(t);
  }, [changedAt, user, ready, sync]);

  const value = useMemo<CloudCtx>(() => ({
    configured: cloudConfigured,
    user, state: user ? state : 'off', lastSync, error,
    signIn: async (email, password) => {
      const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      return e ? (/invalid/i.test(e.message) ? 'Email or password is wrong.' : e.message) : null;
    },
    signUp: async (email, password) => {
      const { data, error: e } = await supabase.auth.signUp({ email: email.trim(), password });
      if (e) return /registered/i.test(e.message) ? 'That email already has an account. Sign in instead.' : e.message;
      return data.session ? null : 'Account made. Check your email to confirm it, then sign in.';
    },
    signOut: async () => {
      await supabase.auth.signOut().catch(() => {});
      setLastSync(null);
    },
    deleteAccount: async () => {
      try {
        await callFunction<{ ok: boolean }>('account', {});
        await supabase.auth.signOut().catch(() => {});
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : 'Could not delete the account.';
      }
    },
    syncNow: async () => { if (user) await sync(user.id); },
    backupNow: async (onProgress) => (user ? backupPhotos(user.id, snapshot(), onProgress) : 0),
  }), [user, state, lastSync, error, sync, snapshot]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCloud(): CloudCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCloud outside CloudProvider');
  return c;
}
