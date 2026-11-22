import { aiLanguage, docLang } from '@/i18n';
import { router } from 'expo-router';

import type { EstimateAction } from '@/engine/assistant';
import { lessonsContext, type PriceLesson } from '@/engine/books';
import { learnedContext, learnFromQuotes } from '@/engine/learned';
import { historyPerSf } from '@/engine/estimator';
import { money } from '@/engine/format';
import { jobType, perUnit } from '@/engine/jobTypes';
import { workSummary } from '@/engine/profile';
import type { Estimate, PastJob, PriceBook, Profile } from '@/engine/types';
import type { Draft } from '@/store/AppContext';

import { aiFor } from './host';

/** Opens a new estimate from something said in the chat: Studwise plans the work for that job, the contractor checks it. */
export async function startEstimateFromChat(
  action: EstimateAction, opts: { apiKey: string; aiAllowed: boolean; profile: Profile | null; pastJobs: PastJob[]; lessons?: PriceLesson[]; estimates?: Estimate[]; priceBook: PriceBook; setDraft: (d: Draft) => void },
) {
  const jt = jobType(action.jobTypeId);
  const h = historyPerSf(action.jobTypeId, 'mid', opts.pastJobs);
  const finish = opts.profile?.work?.finish ?? 'mid';
  // Rejects when the AI is off, fails, or needs a measurement: the chat says so (there is no template to fall back on).
  const plan = await aiFor(opts.apiKey, opts.aiAllowed).planJob({
    jobTypeId: action.jobTypeId, text: action.notes, finish, priceBook: opts.priceBook, markupPct: opts.profile?.markupPct ?? 20,
    wantVi: docLang() === 'vi' || opts.profile?.quoteLanguage === 'vi',
  }, [], {
    about: opts.profile?.about,
    work: workSummary(opts.profile?.work),
    history: h.perSf ? `${h.count} past jobs, average ${money(h.perSf)}${perUnit(jt.unit)}` : undefined,
    prices: lessonsContext(opts.lessons ?? []),
    learned: learnedContext(learnFromQuotes(opts.estimates ?? [], opts.profile?.quoteLanguage ?? 'en')),
    language: aiLanguage(),
  });
  const own = Object.fromEntries(jt.questions.filter((q) => q.custom).map((q) => [q.id, q.default]));
  opts.setDraft({
    jobTypeId: action.jobTypeId,
    mode: 'detailed',
    title: action.title || jt.name,
    clientName: '', address: '', description: action.notes, scopeNote: '', photos: [],
    finish,
    answers: { ...own, ...(plan.answers as Draft['answers']), ...(plan.size ? { sizeSf: plan.size } : {}) },
    customItems: [],
    work: plan.work,
    heard: [],
    aiNotes: plan.notes,
  });
  router.push('/work');
}
