import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { applyMarkup, buildEstimate } from '@/engine/estimator';
import { newId } from '@/engine/format';
import type {
  Answers, Estimate, EstimateMode, EstimateStatus, FinishLevel, JobTypeId, PastJob, Presets, PriceBook, Profile, ScopeItem,
} from '@/engine/types';

const KEY = 'estimating-app/v1';

export interface Draft {
  id?: string; // set when editing an existing estimate
  jobTypeId: JobTypeId;
  mode: EstimateMode;
  title: string;
  clientName: string;
  address: string;
  description: string;
  scopeNote: string;
  photos: string[];
  finish: FinishLevel;
  answers: Answers;
  customItems: ScopeItem[];
  heard: string[];
  markupPct?: number;
}

interface Persisted {
  profile: Profile | null;
  presets: Presets;
  priceBook: PriceBook;
  pastJobs: PastJob[];
  estimates: Estimate[];
}

const EMPTY: Persisted = { profile: null, presets: {}, priceBook: { labor: {}, materials: {} }, pastJobs: [], estimates: [] };

export const DEFAULT_SCHEDULE = [
  { label: 'Deposit at signing', pct: 10 },
  { label: 'Rough-in complete', pct: 40 },
  { label: 'Finishes complete', pct: 40 },
  { label: 'Final walkthrough', pct: 10 },
];

interface Ctx extends Persisted {
  ready: boolean;
  draft: Draft | null;
  setDraft: (d: Draft | null) => void;
  saveProfile: (p: Profile) => void;
  savePresets: (p: Presets) => void;
  savePriceBook: (p: PriceBook) => void;
  savePastJob: (j: PastJob) => void;
  deletePastJob: (id: string) => void;
  /** Builds (or rebuilds) an estimate from a draft and saves it. Returns its id. */
  commitDraft: (d: Draft) => string;
  updateEstimate: (id: string, patch: { status?: EstimateStatus; markupPct?: number }) => void;
  deleteEstimate: (id: string) => void;
  resetAll: () => void;
}

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Persisted>(EMPTY);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const dataRef = useRef<Persisted>(EMPTY);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const loaded = { ...EMPTY, ...(JSON.parse(raw) as Partial<Persisted>) };
          dataRef.current = loaded;
          setData(loaded);
        }
      } catch {
        // Corrupt or unavailable storage: start fresh rather than crash.
      }
      setReady(true);
    })();
  }, []);

  const update = useCallback((fn: (d: Persisted) => Persisted) => {
    const next = fn(dataRef.current);
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
        description: d.description.trim(), scopeNote: d.scopeNote.trim(), photos: d.photos, finish: d.finish, answers: d.answers,
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
        })),
      deleteEstimate: (id) => update((d) => ({ ...d, estimates: d.estimates.filter((e) => e.id !== id) })),
      resetAll: () => {
        setDraft(null);
        update(() => EMPTY);
      },
    }),
    [data, ready, draft, update, commitDraft],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp must be used inside AppProvider');
  return c;
}
