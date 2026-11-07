import type { User } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { termsFrom } from '@/engine/contract';
import { useApp } from '@/store/AppContext';
import { celebrate } from '@/ui/celebrate';
import { notify } from '@/ui/notify';

import { callFunction, supabase } from './client';
import { CLOUD, cloudConfigured } from './config';
import { fetchClientNotes, fetchNewSignatures, markApplied, markNoteSeen, signedHtml, toSignature } from './sign';
import { decide } from './decide';
import { backupPhotos, clearMeta, loadMeta, pullWorkspace, pushWorkspace, restorePhotos, saveMeta } from './sync';

export type SyncState = 'off' | 'syncing' | 'ok' | 'error';

interface CloudCtx {
  configured: boolean;
  user: User | null;
  state: SyncState;
  lastSync: string | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  /** False until the phone has checked whether someone is signed in. */
  authReady: boolean;
  /** The first sync after signing in: the app waits for it so a new phone gets the account's data before setup. */
  firstSync: 'waiting' | 'done' | 'failed';
  retryFirstSync: () => void;
  skipFirstSync: () => void;
  resetPassword: (email: string) => Promise<string | null>;
  /** Checks the current password, then sets a new one. Returns a message on failure. */
  changePassword: (current: string, next: string) => Promise<string | null>;
  /** Saves to the cloud, signs out and clears this phone. Returns a message if the data could not be saved first. */
  signOut: (force?: boolean) => Promise<string | null>;
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

/** "Request changes" from clients: kept on the estimate and shown as a notice, once. */
async function applyClientNotes(uid: string, a: ReturnType<typeof useApp>) {
  for (const n of await fetchClientNotes(uid)) {
    const est = a.estimates.find((e) => e.id === n.estimate_id);
    if (est) {
      a.updateEstimate(est.id, { addClientNote: { at: n.client_note_at, name: n.client_note_name, text: n.client_note } });
      notify(`${n.client_note_name || 'Your client'} asked for changes`, `“${est.title}”: ${n.client_note}`);
    }
    await markNoteSeen(n.id);
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
  const [authReady, setAuthReady] = useState(!cloudConfigured);
  const [firstSync, setFirstSync] = useState<'waiting' | 'done' | 'failed'>('waiting');
  const busy = useRef(false);
  const uidRef = useRef<string | undefined>(undefined);
  const appRef = useRef(app);
  useEffect(() => { appRef.current = app; });

  useEffect(() => {
    if (!cloudConfigured) return;
    const take = (next: User | null) => {
      if (next?.id !== uidRef.current) { uidRef.current = next?.id; setFirstSync('waiting'); }
      setUser(next);
    };
    supabase.auth.getSession().then(({ data }) => take(data.session?.user ?? null)).catch(() => {}).finally(() => setAuthReady(true));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => take(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  /** One full sync: decide which side wins, move the data, then photos and online signatures. */
  const sync = useCallback(async (uid: string): Promise<boolean> => {
    if (busy.current) return false;
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
      await applyClientNotes(uid, appRef.current);
      setLastSync(new Date().toISOString());
      setError(null);
      setState('ok');
      setFirstSync('done');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
      setState('error');
      setFirstSync((f) => (f === 'waiting' ? 'failed' : f));
      return false;
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
    authReady, firstSync,
    retryFirstSync: () => { if (user) { setFirstSync('waiting'); sync(user.id); } },
    skipFirstSync: () => setFirstSync('done'),
    resetPassword: async (email) => {
      const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: CLOUD.resetPage });
      return e ? (/rate|seconds/i.test(e.message) ? 'Too many tries. Wait a minute and try again.' : e.message) : null;
    },
    changePassword: async (current, next) => {
      if (!user?.email) return 'Log in first.';
      const { error: wrong } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
      if (wrong) return 'Your current password is not right.';
      const { error: e } = await supabase.auth.updateUser({ password: next });
      return e ? (/different/i.test(e.message) ? 'Choose a password different from your current one.' : e.message) : null;
    },
    signOut: async (force) => {
      if (user && !force) {
        for (let i = 0; i < 40 && busy.current; i++) await new Promise((r) => setTimeout(r, 250));
        const ok = await sync(user.id);
        if (!ok) return 'Could not save your latest work to the cloud. Check your connection, or sign out anyway and lose changes made since the last sync.';
        await backupPhotos(user.id, snapshot()).catch(() => 0);
      }
      await supabase.auth.signOut().catch(() => {});
      await clearMeta();
      appRef.current.resetAll(true);
      setLastSync(null);
      return null;
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
  }), [user, state, lastSync, error, sync, snapshot, authReady, firstSync]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCloud(): CloudCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCloud outside CloudProvider');
  return c;
}
