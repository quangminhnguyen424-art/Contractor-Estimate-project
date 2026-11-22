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
import { baseOf, mergeWorkspaces } from './merge';
import { drainMail } from './receipts';
import { backupPhotos, clearBase, clearMeta, loadBase, loadMeta, myWorkspace, pullWorkspace, pushWorkspace, restorePhotos, saveBase, saveMeta, workspaceStamp } from './sync';
import { sanitizePersisted, type Persisted } from '@/store/sanitize';

export type SyncState = 'off' | 'syncing' | 'ok' | 'error';

interface CloudCtx {
  configured: boolean;
  user: User | null;
  /** The workspace this account works in: its own id, or its Team owner's. Signing links and photos live there. */
  workspaceId: string | null;
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

/** Login errors in words a person can act on, instead of the server's or the network's own text. */
function plainAuthError(message: string): string {
  if (/failed to fetch|network request failed|network|timeout|load failed/i.test(message)) return 'No internet connection. Check your signal and try again.';
  if (/invalid login|invalid credentials/i.test(message)) return 'Email or password is wrong.';
  if (/not confirmed/i.test(message)) return 'Confirm your email first: open the email from Studwise and tap the link, then log in. If it is not there, check spam or create the account again to get a new email.';
  if (/registered|already/i.test(message)) return 'That email already has an account. Sign in instead.';
  if (/rate|seconds|too many/i.test(message)) return 'Too many tries. Wait a minute and try again.';
  return message;
}

/** The phone's own copy from just before another device's newer work replaced it. Kept so support can recover it. */
const REPLACED = 'estimating-app/replaced-copy';

const device = `${Platform.OS} ${String(Platform.Version ?? '')}`.trim();

/** Signs in to Studwise cloud, keeps data and photos in step, and records quotes clients signed online. */
export function CloudProvider({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const { ready, changedAt } = app;
  const [user, setUser] = useState<User | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const wsRef = useRef<string | null>(null);
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
      const ws = await myWorkspace(uid);
      if (wsRef.current !== ws) { wsRef.current = ws; setWorkspaceId(ws); }
      const meta = await loadMeta();
      // This phone already holds this account's work: open it now; the sync carries on behind.
      if (meta?.uid === ws && a().snapshot().profile) setFirstSync('done');
      const stamp = await workspaceStamp(ws);
      const local = a().snapshot();
      const localChange = a().changedAt;
      // On someone else's Team, agreeing to the Terms is each person's own: never take another person's agreement.
      const own = (d: Persisted): Persisted => (ws === uid ? d : { ...d, consent: local.consent });
      const member = ws !== uid;
      const same = meta?.uid === ws; // this phone already works in this workspace (not a switch of account or team)
      /**
       * Joins this phone's copy and the cloud's item by item, then saves the joined copy, but only over the cloud copy
       * it read (if someone saves in between, it reads and joins again).
       */
      const merge = async () => {
        const base = await loadBase();
        for (let i = 0; i < 3; i++) {
          const remote = await pullWorkspace(ws);
          if (!remote) break;
          const cloud = sanitizePersisted(remote.data).data;
          const change = a().changedAt;
          const snap = a().snapshot();
          const merged = own(mergeWorkspaces(snap, cloud, base));
          // A team member never writes their own Terms agreement into the company's copy.
          const at = await pushWorkspace(ws, member ? { ...merged, consent: cloud.consent } : merged, device, remote.updatedAt);
          if (!at) continue;
          // Anything typed while that was saving is joined in too, and goes up with the next sync.
          const now = a().snapshot();
          const edited = now !== snap;
          a().replaceFromCloud(edited ? own(mergeWorkspaces(now, merged, baseOf(snap))) : merged, true);
          await saveMeta({ uid: ws, remoteAt: at, syncedChange: edited ? Math.min(change, localChange) : change });
          await saveBase(merged);
          backupPhotos(ws, merged).catch(() => {});
          return;
        }
        throw new Error('Others are saving at the same time. Trying again shortly.');
      };
      const action = decide({ uid: ws, meta, remote: stamp, localChange, localEmpty: !local.profile });
      if (action === 'pull') {
        const remote = await pullWorkspace(ws);
        if (remote) {
          // Work done here while offline is about to be replaced by newer work from another device: keep a copy.
          const unsent = !!local.profile && (!meta || (meta.uid === ws && localChange > meta.syncedChange));
          if (unsent) await AsyncStorage.setItem(REPLACED, JSON.stringify({ at: new Date().toISOString(), data: local })).catch(() => {});
          const next = own(sanitizePersisted(remote.data).data);
          if (a().replaceFromCloud(next, same)) {
            await saveMeta({ uid: ws, remoteAt: remote.updatedAt, syncedChange: Date.now() });
            await saveBase(next);
            if (unsent) notify('Updated from your account', 'The work saved in your account replaced changes made on this phone that had not been backed up.');
          }
        }
      } else if (action === 'push' && member) {
        await merge(); // a member's changes always go through the join, so the company's copy keeps its own settings
      } else if (action === 'push') {
        const at = await pushWorkspace(ws, local, device, stamp ? meta?.remoteAt : null);
        if (at) {
          await saveMeta({ uid: ws, remoteAt: at, syncedChange: localChange });
          await saveBase(local);
          backupPhotos(ws, local).catch(() => {});
        } else await merge(); // someone saved in between
      } else if (action === 'merge') {
        await merge();
      } else if (action === 'wipe') {
        // Another account's work is on this phone and this account has none yet: start clean, send nothing.
        await clearMeta();
        await clearBase();
        a().resetAll();
      } else if (stamp) {
        await saveMeta({ uid: ws, remoteAt: stamp.updatedAt, syncedChange: localChange });
        if (local.profile && !(await loadBase())) await saveBase(local); // first sync after this update
      }
      // Receipts that came by mail since the last sync join the inbox (and go up with the next one).
      await drainMail(a());
      // Photos this phone is missing (a new phone, or a restore that was cut short) come down after every sync.
      restorePhotos(ws, a().snapshot()).catch(() => {});
      await applySignatures(ws, a());
      await applyClientNotes(ws, a());
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
    // Every 5 minutes while the app is open (and on coming back): light, a single timestamp check when nothing changed.
    const t = setInterval(() => { if (AppState.currentState === 'active') void sync(user.id); }, 5 * 60 * 1000);
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
    user, workspaceId: user ? workspaceId ?? user.id : null, state: user ? state : 'off', lastSync, error,
    signIn: async (email, password) => {
      const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password }).catch((x: unknown) => ({ error: x as Error }));
      return e ? plainAuthError(e.message) : null;
    },
    signUp: async (email, password) => {
      const { data, error: e } = await supabase.auth.signUp({ email: email.trim(), password }).catch((x: unknown) => ({ data: { session: null, user: null }, error: x as Error }));
      if (e) return plainAuthError(e.message);
      // With email confirmation on, an address that already has an account comes back with no identities and no email is sent.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return 'That email already has an account. Sign in instead.';
      return data.session ? null : 'Account made. Check your email to confirm it, then sign in.';
    },
    authReady, firstSync,
    retryFirstSync: () => { if (user) { setFirstSync('waiting'); sync(user.id); } },
    skipFirstSync: () => setFirstSync('done'),
    resetPassword: async (email) => {
      const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: CLOUD.resetPage }).catch((x: unknown) => ({ error: x as Error }));
      return e ? plainAuthError(e.message) : null;
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
        await backupPhotos(wsRef.current ?? user.id, appRef.current.snapshot()).catch(() => null);
      }
      // This phone only: other devices stay logged in, and it works with no signal.
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      await clearMeta();
      await clearBase();
      wsRef.current = null; setWorkspaceId(null);
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
        await clearBase();
        wsRef.current = null; setWorkspaceId(null);
        appRef.current.resetAll();
        setLastSync(null);
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : 'Could not delete the account.';
      }
    },
    syncNow: async () => {
      if (!user) return;
      // If a sync is already running, wait for it, then sync again so this call always sees the latest state.
      for (let i = 0; i < 75 && busy.current; i++) await new Promise((r) => setTimeout(r, 200));
      await sync(user.id);
    },
    backupNow: async (onProgress) => (user ? backupPhotos(wsRef.current ?? user.id, appRef.current.snapshot(), onProgress) : { sent: 0, failed: 0 }),
  }), [user, workspaceId, state, lastSync, error, sync, authReady, firstSync]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCloud(): CloudCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCloud outside CloudProvider');
  return c;
}
