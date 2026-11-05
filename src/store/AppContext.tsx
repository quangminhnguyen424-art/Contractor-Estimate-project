import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { applyMarkup, buildEstimate } from '@/engine/estimator';
import { newId } from '@/engine/format';
import { jobType, setCustomJobs } from '@/engine/jobTypes';
import { estimatePayload, type Connections, type HookEvent } from '@/engine/connect';
import { emptyContract, nextInvoiceNo, termsFrom, type Contract, type Invoice } from '@/engine/contract';
import { emptyMoney, type PriceLesson, type ProjectMoney } from '@/engine/books';
import { stopPlan, type FollowUpPlan } from '@/engine/followup';
import { consentCurrent, TERMS_VERSION } from '@/engine/legal';
import type { CalEvent } from '@/engine/schedule';
import { laborCost, movedEvent, type Attendance, type TeamMember } from '@/engine/team';
import { projectFromEstimate, type SiteProject } from '@/engine/site';
import { deletePhotoFile } from '@/ui/photoStore';
import { cancelAllReminders, cancelReminder, scheduleReminder } from '@/ui/reminders';
import { postHook } from '@/ui/webhook';

import { wonToPastJobs } from './learning';
import { DEFAULT_SCHEDULE, EMPTY, sanitizePersisted, type Persisted } from './sanitize';
import type {
  Answers, CustomJobType, Estimate, EstimateMode, EstimateStatus, FinishLevel, JobTypeId, PastJob, PlanRoom, Presets, PriceBook, Profile,
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
  /** Floor plan rooms (scanned or measured). */
  plan?: PlanRoom[];
  /** Answers Claude filled in, and where from, so the contractor confirms them. */
  aiFilled?: Record<string, 'notes' | 'photo'>;
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
  saveCustomType: (t: CustomJobType, opts?: { resetPricing?: boolean }) => void;
  /** Remove an own type, its questions, prices and past jobs. Estimates stay (shown as "Other work"). */
  deleteCustomType: (id: string) => void;
  /** Replace the contractor's own questions for one job type. */
  saveQuestions: (jobTypeId: JobTypeId, qs: Question[]) => void;
  /** Job site projects. `updateProject` applies a change to the latest saved copy. */
  updateProject: (id: string, fn: (p: SiteProject) => SiteProject) => void;
  addProject: (p: SiteProject) => void;
  deleteProject: (id: string) => void;
  /** Opens (or creates) the job site project for a won estimate. Returns its id. */
  projectForEstimate: (estimateId: string) => string | null;
  /** The contract for a won job (signature, change orders, invoices, payments), applied to the latest saved copy. */
  updateContract: (estimateId: string, fn: (c: Contract) => Contract) => void;
  /** Makes an invoice with the next number (never reused) and freezes the job's terms if not already frozen. */
  issueInvoice: (estimateId: string, inv: Omit<Invoice, 'number'>) => Invoice | null;
  /** Links to other apps (Zapier / Make webhook). */
  saveConnections: (c: Connections) => void;
  /** Tells the contractor's other apps that something happened (if a webhook link is set and the event is on). */
  emit: (event: HookEvent, data: Record<string, unknown>) => void;
  /** True once this user agreed to the current Terms. */
  termsOk: boolean;
  /** True when the user allowed sending their content to the AI provider. */
  aiAllowed: boolean;
  acceptTerms: (ai: boolean) => void;
  setAiSharing: (on: boolean) => void;
  /** Crew and subs. */
  saveMember: (m: TeamMember) => void;
  deleteMember: (id: string) => void;
  /** Follow-up plan for an unsigned quote. */
  saveFollowUp: (p: FollowUpPlan) => void;
  /** A job site's costs, buy list and tax settings, applied to the latest saved copy. */
  updateMoney: (projectId: string, fn: (m: ProjectMoney) => ProjectMoney) => void;
  addLessons: (ls: PriceLesson[]) => void;
  /** Forgets the price lessons a deleted receipt taught. */
  dropLessons: (costId: string) => void;
  /**
   * Morning check for one person on one booked day. "worked" adds their labor cost to the job (once);
   * "moved" books them on the new date.
   */
  markAttendance: (eventId: string, memberId: string, a: Attendance) => void;
  /** Calendar events. */
  saveEvent: (e: CalEvent) => void;
  deleteEvent: (id: string) => void;
  /** A floor plan from the Scan 3D screen, waiting to be used by the next new estimate (not saved). */
  pendingPlan: PlanRoom[] | null;
  setPendingPlan: (p: PlanRoom[] | null) => void;
  /** True when the last save failed (phone or browser storage full). */
  saveFailed: boolean;
  /** Deletes photo files, but only once the change that removed them has been saved. */
  deletePhotosLater: (uris: string[]) => void;
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

/** Removes upcoming "Follow up:" reminders for a quote (and their phone notifications). */
function dropFollowEvents(events: CalEvent[], estimateId: string): CalEvent[] {
  return events.filter((e) => {
    const drop = e.estimateId === estimateId && !e.done && e.title.startsWith('Follow up:');
    if (drop) cancelReminder(e.notificationId);
    return !drop;
  });
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Persisted>(EMPTY);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PlanRoom[] | null>(null);
  const dataRef = useRef<Persisted>(EMPTY);
  const [apiKey, setApiKey] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);

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

  // Saving is batched: typing in a note saves once the typing pauses (and right away when the app is put away),
  // instead of rewriting everything on every key press.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toDelete = useRef<string[]>([]);
  const flush = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const doomed = toDelete.current;
    toDelete.current = [];
    AsyncStorage.setItem(KEY, JSON.stringify(dataRef.current)).then(
      () => { setSaveFailed(false); doomed.forEach(deletePhotoFile); },
      () => { setSaveFailed(true); toDelete.current.push(...doomed); },
    );
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s !== 'active' && saveTimer.current) flush(); });
    const onHide = () => { if (saveTimer.current) flush(); };
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('pagehide', onHide);
    return () => {
      sub.remove();
      if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('pagehide', onHide);
    };
  }, [flush]);

  const update = useCallback((fn: (d: Persisted) => Persisted) => {
    const next = fn(dataRef.current);
    // Keep the job type list in step with the contractor's own types and questions before anything renders.
    setCustomJobs(next.customTypes, next.customQuestions);
    dataRef.current = next;
    setData(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 400);
  }, [flush]);

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
      const jt = jobType(d.jobTypeId);
      return {
        job: { name: jt.name, vi: jt.vi, unit: jt.unit, exclusions: jt.exclusions, exclusionsVi: jt.exclusionsVi },
        id: existing?.id ?? newId(), createdAt: existing?.createdAt ?? now, updatedAt: now,
        status: existing?.status ?? 'draft', mode: d.mode, jobTypeId: d.jobTypeId,
        title: d.title.trim() || 'Untitled estimate', clientName: d.clientName.trim(), address: d.address.trim(),
        description: d.description.trim(), scopeNote: d.scopeNote.trim(), aiNotes: d.aiNotes ?? existing?.aiNotes ?? [], photos: d.photos, finish: d.finish, answers: d.answers,
        customItems: d.customItems, markupPct, salesTaxPct: profile.salesTaxPct, ...r,
        plan: d.plan?.length ? d.plan : undefined,
      };
    },
    [],
  );

  const commitDraft = useCallback(
    (d: Draft) => {
      const prev = dataRef.current;
      const existing = d.id ? prev.estimates.find((e) => e.id === d.id) : undefined;
      const est = compute(d, prev, existing);
      update((cur) => {
        const estimates = [est, ...cur.estimates.filter((e) => e.id !== est.id)];
        // An edited won job updates what the app learned from it.
        return { ...cur, estimates, pastJobs: wonToPastJobs({ ...cur, estimates }, est.id, est.status) };
      });
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
      saveCustomType: (t, opts) =>
        update((d) => {
          const customTypes = [...d.customTypes.filter((x) => x.id !== t.id), t];
          if (!opts?.resetPricing) return { ...d, customTypes };
          // A new price unit makes old prices and past jobs meaningless ($/SF is not $ per job).
          const { [t.id]: _old, ...presets } = d.presets;
          return { ...d, customTypes, presets, pastJobs: d.pastJobs.filter((j) => j.jobTypeId !== t.id) };
        }),
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
      updateProject: (id, fn) =>
        update((d) => ({ ...d, projects: d.projects.map((p) => (p.id === id ? fn(p) : p)) })),
      addProject: (p) => update((d) => ({ ...d, projects: [p, ...d.projects.filter((x) => x.id !== p.id)] })),
      deleteProject: (id) => update((d) => ({ ...d, projects: d.projects.filter((p) => p.id !== id) })),
      projectForEstimate: (estimateId) => {
        const cur = dataRef.current;
        const existing = cur.projects.find((p) => p.estimateId === estimateId);
        if (existing) return existing.id;
        const est = cur.estimates.find((e) => e.id === estimateId);
        if (!est) return null;
        const p = projectFromEstimate(est, est.job?.name ?? jobType(est.jobTypeId).name, newId(), newId);
        update((d) => ({ ...d, projects: [p, ...d.projects] }));
        return p.id;
      },
      updateContract: (estimateId, fn) =>
        update((d) => {
          const cur = d.contracts.find((c) => c.estimateId === estimateId) ?? emptyContract(estimateId);
          return { ...d, contracts: [fn(cur), ...d.contracts.filter((c) => c.estimateId !== estimateId)] };
        }),
      issueInvoice: (estimateId, inv) => {
        const cur = dataRef.current;
        const est = cur.estimates.find((e) => e.id === estimateId);
        if (!est || !cur.profile) return null;
        const made: Invoice = { ...inv, number: nextInvoiceNo(cur.contracts, cur.lastInvoiceNo) };
        const profile = cur.profile;
        update((d) => {
          const c = d.contracts.find((x) => x.estimateId === estimateId) ?? emptyContract(estimateId);
          const next = { ...c, terms: c.terms ?? termsFrom(est, profile), invoices: [...c.invoices, made] };
          return { ...d, lastInvoiceNo: Math.max(d.lastInvoiceNo ?? 1000, made.number), contracts: [next, ...d.contracts.filter((x) => x.estimateId !== estimateId)] };
        });
        const dd = dataRef.current;
        postHook(dd.connections, 'invoice.created', { estimate: estimatePayload(est, !!dd.connections?.includeCosts), invoice: made }, profile.companyName).catch(() => {});
        return made;
      },
      saveConnections: (c) => update((d) => ({ ...d, connections: c })),
      termsOk: consentCurrent(data.consent),
      aiAllowed: consentCurrent(data.consent) && data.consent?.ai === true,
      acceptTerms: (ai) => update((d) => ({ ...d, consent: { version: TERMS_VERSION, at: new Date().toISOString(), ai } })),
      setAiSharing: (on) => update((d) => (d.consent ? { ...d, consent: { ...d.consent, ai: on, at: new Date().toISOString() } } : d)),
      saveMember: (m) => update((d) => {
        const team = d.team ?? [];
        return { ...d, team: team.some((x) => x.id === m.id) ? team.map((x) => (x.id === m.id ? m : x)) : [...team, m] };
      }),
      deleteMember: (id) => update((d) => ({
        ...d, team: (d.team ?? []).filter((x) => x.id !== id),
        events: d.events.map((e) => (e.crew?.includes(id) ? { ...e, crew: e.crew.filter((x) => x !== id) } : e)),
      })),
      saveFollowUp: (p) => update((d) => ({ ...d, followups: [p, ...(d.followups ?? []).filter((x) => x.estimateId !== p.estimateId)] })),
      updateMoney: (projectId, fn) =>
        update((d) => ({ ...d, projects: d.projects.map((p) => (p.id === projectId ? { ...p, money: fn(p.money ?? emptyMoney()) } : p)) })),
      addLessons: (ls) => update((d) => ({ ...d, lessons: [...(d.lessons ?? []), ...ls].slice(-3000) })),
      dropLessons: (costId) => update((d) => ({ ...d, lessons: (d.lessons ?? []).filter((l) => l.costId !== costId) })),
      markAttendance: (eventId, memberId, a) => {
        const cur = dataRef.current;
        const ev = cur.events.find((e) => e.id === eventId);
        const member = (cur.team ?? []).find((m) => m.id === memberId);
        if (!ev || !member) return;
        const prev = ev.attend?.[memberId];
        let att: Attendance = { state: a.state, at: a.at, ...(a.movedTo ? { movedTo: a.movedTo } : {}), ...(a.note ? { note: a.note } : {}), ...(prev?.costId ? { costId: prev.costId } : {}) };
        let projects = cur.projects;
        let events = cur.events;
        const projectId = ev.projectId ?? cur.projects.find((p) => p.estimateId && p.estimateId === ev.estimateId)?.id;
        const amount = laborCost(member, ev);
        // A "per job" rate is charged once per job site, however many days they work.
        const jobRateAlreadyCharged = member.rateUnit === 'job' && !!projectId
          && !!cur.projects.find((p) => p.id === projectId)?.money?.costs.some((c) => c.memberId === memberId);
        if (a.state === 'worked' && !prev?.costId && projectId && amount > 0 && !jobRateAlreadyCharged) {
          const costId = newId();
          att = { ...att, costId };
          projects = projects.map((p) => (p.id !== projectId ? p : {
            ...p, money: { ...(p.money ?? emptyMoney()), costs: [...(p.money ?? emptyMoney()).costs, {
              id: costId, date: ev.date, kind: member.role === 'sub' ? 'subs' as const : 'labor' as const, vendor: member.name, note: `${ev.title} (${member.trade || member.role})`,
              amount, memberId, eventId, createdAt: new Date().toISOString(),
            }] },
          }));
        } else if (a.state !== 'worked' && prev?.costId) {
          // Changed their mind: take the labor added for this day back out.
          const gone = prev.costId;
          projects = projects.map((p) => (p.money?.costs.some((c) => c.id === gone) ? { ...p, money: { ...p.money, costs: p.money.costs.filter((c) => c.id !== gone) } } : p));
          const { costId: _c, ...rest } = att;
          att = rest;
        }
        // A reschedule books the new day; changing it again (or undoing it) removes that booking.
        const sameMove = a.state === 'moved' && prev?.state === 'moved' && prev.movedTo === a.movedTo && !!prev.movedEventId;
        if (prev?.movedEventId && !sameMove) {
          const old = events.find((e) => e.id === prev.movedEventId);
          if (old) cancelReminder(old.notificationId);
          events = events.filter((e) => e.id !== prev.movedEventId);
        }
        if (sameMove) att = { ...att, movedEventId: prev!.movedEventId };
        else if (a.state === 'moved' && a.movedTo && a.movedTo !== ev.date) {
          const moved = movedEvent(ev, memberId, a.movedTo, newId(), new Date().toISOString());
          att = { ...att, movedEventId: moved.id };
          events = [moved, ...events];
          scheduleReminder(moved).then((r) => {
            if (r.id) update((d) => ({ ...d, events: d.events.map((x) => (x.id === moved.id ? { ...x, notificationId: r.id } : x)) }));
          }).catch(() => {});
        }
        events = events.map((e) => (e.id === eventId ? { ...e, attend: { ...(e.attend ?? {}), [memberId]: att } } : e));
        update((d) => ({ ...d, projects, events }));
      },
      emit: (event, data) => {
        const d = dataRef.current;
        postHook(d.connections, event, data, d.profile?.companyName ?? '').catch(() => {});
      },
      saveEvent: (e) => update((d) => ({ ...d, events: [e, ...d.events.filter((x) => x.id !== e.id)] })),
      deleteEvent: (id) => update((d) => ({ ...d, events: d.events.filter((x) => x.id !== id) })),
      pendingPlan,
      setPendingPlan,
      saveFailed,
      saveQuestions: (jobTypeId, qs) =>
        update((d) => {
          const { [jobTypeId]: _old, ...rest } = d.customQuestions;
          return { ...d, customQuestions: qs.length ? { ...rest, [jobTypeId]: qs } : rest };
        }),
      commitDraft,
      updateEstimate: (id, patch) => {
        const before = dataRef.current.estimates.find((e) => e.id === id);
        update((d) => {
          const estimates = d.estimates.map((e) => {
            if (e.id !== id) return e;
            let next = { ...e, status: patch.status ?? e.status };
            if (patch.markupPct != null && patch.markupPct !== e.markupPct && d.profile) {
              // Re-price markup only; saved costs and tax rate stay as quoted.
              next = { ...applyMarkup(next, patch.markupPct, d.profile.minMarkupPct), updatedAt: new Date().toISOString() };
            }
            return next;
          });
          const status = estimates.find((e) => e.id === id)?.status ?? 'draft';
          // A signed or lost job ends its follow-ups.
          const followups = (d.followups ?? []).map((f) => (f.estimateId === id && !f.stopped && (status === 'won' || status === 'lost')
            ? stopPlan(f, status === 'won' ? 'signed' : 'lost', new Date().toISOString()) : f));
          // ...and their reminders leave the calendar.
          const ended = status === 'won' || status === 'lost';
          const events = ended ? dropFollowEvents(d.events, id) : d.events;
          // Status or markup changes on a won job keep its past job (what the app learned) in step.
          return { ...d, estimates, followups, events, pastJobs: wonToPastJobs({ ...d, estimates }, id, status) };
        });
        // Let the contractor's other apps know when a quote goes out or a job is won.
        const after = dataRef.current.estimates.find((e) => e.id === id);
        if (before && after && before.status !== after.status && (after.status === 'sent' || after.status === 'won')) {
          const d = dataRef.current;
          postHook(d.connections, after.status === 'sent' ? 'estimate.sent' : 'estimate.won',
            { estimate: estimatePayload(after, !!d.connections?.includeCosts) }, d.profile?.companyName ?? '').catch(() => {});
        }
      },
      deleteEstimate: (id) => update((d) => ({
        ...d, estimates: d.estimates.filter((e) => e.id !== id), contracts: d.contracts.filter((c) => c.estimateId !== id),
        followups: (d.followups ?? []).filter((f) => f.estimateId !== id), events: dropFollowEvents(d.events, id),
      })),
      resetAll: () => {
        setDraft(null);
        cancelAllReminders();
        toDelete.current.push(...dataRef.current.projects.flatMap((x) => x.rooms.flatMap((r) => r.photos.map((ph) => ph.uri))));
        update(() => EMPTY);
      },
      deletePhotosLater: (uris) => { toDelete.current.push(...uris); },
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
        if (d.app !== 'estimator' || !d.data || typeof d.data !== 'object') return { ok: false, message: 'That text is not a Bidwell AI backup.' };
        const { data: next, dropped } = sanitizePersisted(d.data);
        if (!next.profile) {
          setCustomJobs(dataRef.current.customTypes, dataRef.current.customQuestions); // keep the current job types
          return { ok: false, message: 'This backup has no company profile.' };
        }
        setDraft(null);
        // Reminders belong to this phone: clear the old ones and set them again for what's coming up.
        const restored = { ...next, events: next.events.map(({ notificationId: _n, ...e }) => e) };
        update(() => restored);
        cancelAllReminders().then(async () => {
          for (const e of restored.events) {
            const r = await scheduleReminder(e).catch(() => ({ id: undefined }));
            if (r.id) update((cur) => ({ ...cur, events: cur.events.map((x) => (x.id === e.id ? { ...x, notificationId: r.id } : x)) }));
          }
        });
        return {
          ok: true,
          message: dropped > 0 ? `Backup restored. ${dropped} damaged item${dropped > 1 ? 's were' : ' was'} left out.` : 'Backup restored.',
        };
      },
    }),
    [data, ready, draft, update, commitDraft, apiKey, saveFailed, pendingPlan],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): Ctx {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp must be used inside AppProvider');
  return c;
}
