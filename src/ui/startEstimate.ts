import { router } from 'expo-router';

import type { EstimateAction } from '@/engine/assistant';
import { historyPerSf } from '@/engine/estimator';
import { money } from '@/engine/format';
import { defaultAnswers, jobType, perUnit } from '@/engine/jobTypes';
import { workSummary } from '@/engine/profile';
import type { PastJob, Profile } from '@/engine/types';
import type { Draft } from '@/store/AppContext';

import { aiFor } from './host';

/** Opens a new estimate from something said in the chat: Claude fills the answers, the contractor checks them. */
export async function startEstimateFromChat(
  action: EstimateAction, opts: { apiKey: string; profile: Profile | null; pastJobs: PastJob[]; setDraft: (d: Draft) => void },
) {
  const jt = jobType(action.jobTypeId);
  const h = historyPerSf(action.jobTypeId, 'mid', opts.pastJobs);
  const parsed = await aiFor(opts.apiKey).parseScope(action.notes, action.jobTypeId, [], {
    about: opts.profile?.about,
    work: workSummary(opts.profile?.work),
    history: h.perSf ? `${h.count} past jobs, average ${money(h.perSf)}${perUnit(jt.unit)}` : undefined,
  });
  opts.setDraft({
    jobTypeId: action.jobTypeId,
    mode: jt.detailed ? 'detailed' : 'quick',
    title: action.title || jt.name,
    clientName: '', address: '', description: action.notes, scopeNote: '', photos: [],
    finish: opts.profile?.work?.finish ?? 'mid',
    answers: { ...defaultAnswers(action.jobTypeId), ...parsed.answers },
    customItems: [],
    heard: parsed.heard,
    aiNotes: parsed.notes ?? [],
    aiFilled: parsed.sources ?? Object.fromEntries(Object.keys(parsed.answers).map((k) => [k, 'notes' as const])),
  });
  router.push('/questions');
}
