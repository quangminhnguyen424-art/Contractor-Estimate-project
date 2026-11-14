import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { packSigned } from '@/engine/brand';
import { termsFrom } from '@/engine/contract';
import { useApp } from '@/store/AppContext';
import { celebrate } from '@/ui/celebrate';
import { notify } from '@/ui/notify';

import { callFunction, storedUser, supabase } from './client';
import { CLOUD, cloudConfigured } from './config';
import { fetchClientNotes, fetchNewSignatures, markApplied, markNoteSeen, signedHtml, toSignature } from './sign';
import { decide } from './decide';
import { backupPhotos, clearMeta, loadMeta, pullWorkspace, pushWorkspace, restorePhotos, saveMeta, workspaceStamp } from './sync';

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
  backupNow: (onProgress?: (done: number, total: number) => void) => Promise<{ sent: number; failed: number }>;
}

const Ctx = createContext<CloudCtx | null>(null);

type App = ReturnType<typeof useApp>;
const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/**
 * Quotes and change orders signed from a link: recorded like a signature on this phone, once.
 * Jobs are read fresh (`a.snapshot()`): this runs right after a sync that may have just brought them to this phone.
 * A signature whose job is not on this phone is left for the phone that has it, never thrown away.
 */
async function applySignatures(uid: string, a: App) {
  const signed = await fetchNewSignatures(uid);
  for (const r of signed) {
    const now = a.snapshot();
    const est = now.estimates.find((e) => e.id === r.estimate_id);
    const prof = now.profile;
    if (!est || !prof) continue;
    const sig = toSignature(r);
    if (r.kind === 'quote') {
      // The link shows the quote as it was when sent. If the price has changed since, what they signed is not this job's price.
      if (Math.abs(Number(r.total) - est.total) > 0.5) {
        notify('Signed an older quote', `${sig.name} signed “${est.title}” at ${usd(Number(r.total))}, but the price is now ${usd(est.total)}. Nothing was recorded. Send the current quote for them to sign.`);
        await markApplied(r.id);
        continue;
      }
      const html = packSigned(signedHtml(r, sig, prof), prof);
      a.updateContract(est.id, (c) => (c.accepted ? c : { ...c, accepted: { ...sig, total: Number(r.total), html: { en: html } }, terms: c.terms ?? termsFrom(est, prof) }));
      if (est.status !== 'won') a.updateEstimate(est.id, { status: 'won' });
      a.emit('quote.signed', { estimate: { id: est.id, title: est.title, client: est.clientName, total: est.total }, signedBy: sig.name, signedAt: sig.signedAt });
      notify('Signed online', `${sig.name} signed “${est.title}”. The job is marked Won.`);
    } else if (r.change_id) {
      const co = now.contracts.find((c) => c.estimateId === est.id)?.changeOrders.find((x) => x.id === r.change_id);
      const pct = now.contracts.find((c) => c.estimateId === est.id)?.terms?.salesTaxPct ?? est.salesTaxPct;
      const current = co ? Math.round(co.amount * (1 + pct / 100) * 100) / 100 : null;
      if (co && current !== null && Math.abs(Number(r.total) - current) > 0.5) {
        notify('Signed an older change order', `${sig.name} signed a change order on “${est.title}” at ${usd(Number(r.total))}, but it now reads ${usd(current)}. Nothing was recorded. Send it again for them to sign.`);
        await markApplied(r.id);
        continue;
      }
      a.updateContract(est.id, (c) => ({
        ...c, changeOrders: c.changeOrders.map((x) => (x.id === r.change_id && x.status === 'pending' ? { ...x, status: 'approved', decidedAt: sig.signedAt, signature: sig } : x)),
      }));
      notify('Change order signed', `${sig.name} approved a change order on “${est.title}”.`);
    }
    celebrate();
    await markApplied(r.id);
  }
}

/** "Request changes" from clients: kept on the estimate and shown as a notice, once. */
async function applyClientNotes(uid: string, a: App) {
  for (const n of await fetchClientNotes(uid)) {
    const est = a.snapshot().estimates.find((e) => e.id === n.estimate_id);
    if (!est) continue; // the phone that has this job shows it
    a.updateEstimate(est.id, { addClientNote: { at: n.client_note_at, name: n.client_note_name, text: n.client_note } });
    notify(`${n.client_note_name || 'Your client'} asked for changes`, `“${est.title}”: ${n.client_note}`);
    await markNoteSeen(n.id);
  }
}

/** The phone's own copy from just before another device's newer work replaced it. Kept so support can recover it. */
const REPLACED = 'estimating-app/replaced-copy';

const device = `${Platform.OS} ${String(Platform.Version ?? '')}`.trim();

/** Signs in to Bidwell cloud, keeps data and photos in step, and records quotes clients signed online. */
export function CloudProvider({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const { ready, changedAt } = app;
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
    let decided = false;
    supabase.auth.getSession().then(async ({ data, error: e }) => {
      decided = true;
      if (data.session) return take(data.session.user);
      // No signal at a cold start: the login cannot be refreshed, but it is still on the phone. Keep the user in
      // their own data instead of showing a login screen they cannot get past on a job site.
      take(e ? await storedUser() : null);
    }).catch(() => {}).finally(() => setAuthReady(true));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' && !session && !decided) return; // getSession above answers this one
      if (event === 'INITIAL_SESSION' && !session) return;
      take(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  /** One full sync: decide which side wins, move the data, then photos and online signatures. */
  const sync = useCallback(async (uid: string): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    setState('syncing');
    // Read the app through the ref: this function must not change with every edit, or each keystroke starts a sync.
    const a = () => appRef.current;
    try {
      const meta = await loadMeta();
      // This phone already holds this account's work: open it now; the sync carries on behind.
      if (meta?.uid === uid && a().snapshot().profile) setFirstSync('done');
      const stamp = await workspaceStamp(uid);
      const local = a().snapshot();
      const localChange = a().changedAt;
      const action = decide({ uid, meta, remote: stamp, localChange, localEmpty: !local.profile });
      if (action === 'pull') {
        const remote = await pullWorkspace(uid);
        if (remote) {
          // Work done here while offline is about to be replaced by newer work from another device: keep a copy.
          const unsent = !!local.profile && (!meta || (meta.uid === uid && localChange > meta.syncedChange));
          if (unsent) await AsyncStorage.setItem(REPLACED, JSON.stringify({ at: new Date().toISOString(), data: local })).catch(() => {});
          if (a().replaceFromCloud(remote.data)) {
            await saveMeta({ uid, remoteAt: remote.updatedAt, syncedChange: Date.now() });
            if (unsent) notify('Updated from your account', 'The work saved in your account replaced changes made on this phone that had not been backed up.');
          }
        }
      } else if (action === 'push') {
        const at = await pushWorkspace(uid, local, device);
        await saveMeta({ uid, remoteAt: at, syncedChange: localChange });
        backupPhotos(uid, local).catch(() => {});
      } else if (action === 'wipe') {
        // Another account's work is on this phone and this account has none yet: start clean, send nothing.
        await clearMeta();
        a().resetAll();
      } else if (stamp) {
        await saveMeta({ uid, remoteAt: stamp.updatedAt, syncedChange: localChange });
      }
      // Photos this phone is missing (a new phone, or a restore that was cut short) come down after every sync.
      restorePhotos(uid, a().snapshot()).catch(() => {});
      await applySignatures(uid, a());
      await applyClientNotes(uid, a());
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
  }, []);

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
        await backupPhotos(user.id, appRef.current.snapshot()).catch(() => null);
      }
      // This phone only: other devices stay logged in, and it works with no signal.
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      await clearMeta();
      appRef.current.resetAll(true);
      setLastSync(null);
      return null;
    },
    deleteAccount: async () => {
      try {
        await callFunction<{ ok: boolean }>('account', {});
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        // The account is gone, so its work leaves this phone too (the next person to log in must not find it).
        await clearMeta();
        appRef.current.resetAll();
        setLastSync(null);
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : 'Could not delete the account.';
      }
    },
    syncNow: async () => { if (user) await sync(user.id); },
    backupNow: async (onProgress) => (user ? backupPhotos(user.id, appRef.current.snapshot(), onProgress) : { sent: 0, failed: 0 }),
  }), [user, state, lastSync, error, sync, authReady, firstSync]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCloud(): CloudCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCloud outside CloudProvider');
  return c;
}
