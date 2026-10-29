import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { applyMarkup, buildEstimate } from '@/engine/estimator';
import { newId } from '@/engine/format';
import { setCustomJobs } from '@/engine/jobTypes';
import { wonToPastJobs } from './learning';
import { DEFAULT_SCHEDULE, EMPTY, sanitizePersisted, type Persisted } from './sanitize';
import type {
  Answers, CustomJobType, Estimate, EstimateMode, EstimateStatus, FinishLevel, JobTypeId, PastJob, Presets, PriceBook, Profile,
  Question, ScopeItem,
} from '@/engine/types';

const KEY = 'estimating-app/v1';
// The Claude key lives in its own slot so it is never included in a data backup.
const AI_KEY = 'estimating-app/claude-key';

export interface Draft {
  id?: string; // set when editing an existing estimate
  jobTypeId: JobTypeId;
  mode: EstimateMode;
  title: string;
  clientName: string;
  address: string;
  description: string;
  scopeNote: string;
  aiNotes?: string[];
  photos: string[];
  finish: FinishLevel;
  answers: Answers;
  customItems: ScopeItem[];
  heard: string[];
  markupPct?: number;
}

export { DEFAULT_SCHEDULE };

interface Ctx extends Persisted {
  ready: boolean;
  draft: Draft | null;
  setDraft: (d: Draft | null) => void;
  saveProfile: (p: Profile) => void;
  savePresets: (p: Presets) => void;
  savePriceBook: (p: PriceBook) => void;
  savePastJob: (j: PastJob) => void;
  deletePastJob: (id: string) => void;
  /** Add or rename one of the contractor's own types of work. */
  saveCustomType: (t: CustomJobType) => void;
  /** Remove an own type, its questions, prices and past jobs. Estimates stay (shown as "Other work"). */
  deleteCustomType: (id: string) => void;
  /** Replace the contractor's own questions for one job type. */
  saveQuestions: (jobTypeId: JobTypeId, qs: Question[]) => void;
  /** Builds (or rebuilds) an estimate from a draft and saves it. Returns its id. */
  commitDraft: (d: Draft) => string;
  updateEstimate: (id: string, patch: { status?: EstimateStatus; markupPct?: number }) => void;
  deleteEstimate: (id: string) => void;
  resetAll: () => void;
  apiKey: string;
  saveApiKey: (key: string) => void;
  /** JSON backup of everything except the Claude key. */
  exportData: () => string;
  /** Replace all data with a backup. */
  importData: (json: string) => { ok: boolean; message: string };
}

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Persisted>(EMPTY);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const dataRef = useRef<Persisted>(EMPTY);
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          // Checked so damaged saved data can never crash the app on launch.
          const loaded = sanitizePersisted(JSON.parse(raw)).data;
          dataRef.current = loaded;
          setData(loaded);
        }
      } catch {
        // Corrupt or unavailable storage: start fresh rather than crash.
      }
      try {
        setApiKey((await AsyncStorage.getItem(AI_KEY)) ?? '');
      } catch {
        // No key available; the app uses the offline demo AI.
      }
      setReady(true);
    })();
  }, []);

  const update = useCallback((fn: (d: Persisted) => Persisted) => {
    const next = fn(dataRef.current);
    // Keep the job type list in step with the contractor's own types and questions before anything renders.
    setCustomJobs(next.customTypes, next.customQuestions);
    dataRef.current = next;
    setData(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const compute = useCallback(
    (d: Draft, base: Persisted, existing?: Estimate): Estimate => {
      const profile = base.profile!;
      const markupPct = d.markupPct ?? existing?.markupPct ?? profile.markupPct;
      const r = buildEstimate({
        jobTypeId: d.jobTypeId, mode: d.mode, finish: d.finish, answers: d.answers, customItems: d.customItems,
        markupPct, minMarkupPct: profile.minMarkupPct, salesTaxPct: profile.salesTaxPct,
        priceBook: base.priceBook, presets: base.presets, pastJobs: base.pastJobs,
      });
      const now = new Date().toISOString();
      return {
        id: existing?.id ?? newId(), createdAt: existing?.createdAt ?? now, updatedAt: now,
        status: existing?.status ?? 'draft', mode: d.mode, jobTypeId: d.jobTypeId,
        title: d.title.trim() || 'Untitled estimate', clientName: d.clientName.trim(), address: d.address.trim(),
        description: d.description.trim(), scopeNote: d.scopeNote.trim(), aiNotes: d.aiNotes ?? existing?.aiNotes ?? [], photos: d.photos, finish: d.finish, answers: d.answers,
        customItems: d.customItems, markupPct, salesTaxPct: profile.salesTaxPct, ...r,
      };
    },
    [],
  );

  const commitDraft = useCallback(
    (d: Draft) => {
      const prev = dataRef.current;
      const existing = d.id ? prev.estimates.find((e) => e.id === d.id) : undefined;
      const est = compute(d, prev, existing);
      update((cur) => ({ ...cur, estimates: [est, ...cur.estimates.filter((e) => e.id !== est.id)] }));
      return est.id;
    },
    [compute, update],
  );

  const value = useMemo<Ctx>(
    () => ({
      ...data,
      ready,
      draft,
      setDraft,
      saveProfile: (p) => update((d) => ({ ...d, profile: p })),
      savePresets: (p) => update((d) => ({ ...d, presets: p })),
      savePriceBook: (p) => update((d) => ({ ...d, priceBook: p })),
      savePastJob: (j) => update((d) => ({ ...d, pastJobs: [j, ...d.pastJobs.filter((x) => x.id !== j.id)] })),
      deletePastJob: (id) => update((d) => ({ ...d, pastJobs: d.pastJobs.filter((x) => x.id !== id) })),
      saveCustomType: (t) =>
        update((d) => ({ ...d, customTypes: [...d.customTypes.filter((x) => x.id !== t.id), t] })),
      deleteCustomType: (id) =>
        update((d) => {
          const { [id]: _q, ...customQuestions } = d.customQuestions;
          const { [id]: _p, ...presets } = d.presets;
          return {
            ...d, customQuestions, presets,
            customTypes: d.customTypes.filter((x) => x.id !== id),
            pastJobs: d.pastJobs.filter((j) => j.jobTypeId !== id),
            profile: d.profile ? { ...d.profile, specialties: d.profile.specialties.filter((s) => s !== id) } : d.profile,
          };
        }),
      saveQuestions: (jobTypeId, qs) =>
        update((d) => {
          const { [jobTypeId]: _old, ...rest } = d.customQuestions;
          return { ...d, customQuestions: qs.length ? { ...rest, [jobTypeId]: qs } : rest };
        }),
      commitDraft,
      updateEstimate: (id, patch) =>
        update((d) => ({
          ...d,
          estimates: d.estimates.map((e) => {
            if (e.id !== id) return e;
            let next = { ...e, status: patch.status ?? e.status };
            if (patch.markupPct != null && patch.markupPct !== e.markupPct && d.profile) {
              // Re-price markup only; saved costs and tax rate stay as quoted.
              next = { ...applyMarkup(next, patch.markupPct, d.profile.minMarkupPct), updatedAt: new Date().toISOString() };
            }
            return next;
          }),
          pastJobs: patch.status ? wonToPastJobs(d, id, patch.status) : d.pastJobs,
        })),
      deleteEstimate: (id) => update((d) => ({ ...d, estimates: d.estimates.filter((e) => e.id !== id) })),
      resetAll: () => {
        setDraft(null);
        update(() => EMPTY);
      },
      apiKey,
      saveApiKey: (key: string) => {
        const k = key.trim();
        setApiKey(k);
        (k ? AsyncStorage.setItem(AI_KEY, k) : AsyncStorage.removeItem(AI_KEY)).catch(() => {});
      },
      exportData: () => JSON.stringify({ app: 'estimator', version: 1, exportedAt: new Date().toISOString(), data: dataRef.current }),
      importData: (json: string) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(json.trim());
        } catch {
          return { ok: false, message: 'That text is not a backup. Paste the whole backup exactly as it was exported.' };
        }
        const d = (parsed ?? {}) as { app?: string; data?: unknown };
        if (d.app !== 'estimator' || !d.data || typeof d.data !== 'object') return { ok: false, message: 'That text is not an Estimator backup.' };
        const { data: next, dropped } = sanitizePersisted(d.data);
        if (!next.profile) {
          setCustomJobs(dataRef.current.customTypes, dataRef.current.customQuestions); // keep the current job types
          return { ok: false, message: 'This backup has no company profile.' };
        }
        setDraft(null);
        update(() => next);
        return {
          ok: true,
          message: dropped > 0 ? `Backup restored. ${dropped} damaged item${dropped > 1 ? 's were' : ' was'} left out.` : 'Backup restored.',
        };
      },
    }),
    [data, ready, draft, update, commitDraft, apiKey],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp must be used inside AppProvider');
  return c;
}
