import { JOB_TYPE_BY_ID, num, str, yes } from './jobTypes';
import type { Answers, Check, JobTypeId, ScopeItem } from './types';

export interface CheckInput {
  jobTypeId: JobTypeId;
  mode: 'quick' | 'detailed';
  answers: Answers;
  scope: ScopeItem[];
  markupPct: number;
  minMarkupPct: number;
  salesTaxPct: number;
}

/**
 * "Check before sending": the items a working GC would catch on review.
 * Warnings need action; info items explain what was added or assumed.
 */
export function runChecks(input: CheckInput): Check[] {
  const { answers: a, scope } = input;
  const has = (id: string) => scope.some((s) => s.assemblyId === id && s.qty > 0);
  const qty = (id: string) => scope.filter((s) => s.assemblyId === id).reduce((t, s) => t + s.qty, 0);
  const out: Check[] = [];
  const jt = JOB_TYPE_BY_ID[input.jobTypeId];

  if (input.mode === 'detailed' && input.markupPct < input.minMarkupPct) {
    out.push({ id: 'margin', level: 'warn', title: `Markup ${input.markupPct}% is below your ${input.minMarkupPct}% minimum`,
      detail: 'Raise the markup or confirm this job is worth doing at a lower margin.' });
  }

  const year = num(a, 'yearBuilt');
  if (year > 0 && year < 1978) {
    out.push({ id: 'rrp', level: 'warn', title: `Built in ${year}: lead-safe work practices required`,
      detail: 'EPA RRP rules apply to pre-1978 homes. Use a certified renovator and add containment and cleanup time.' });
  }

  if (input.jobTypeId === 'basement') {
    const egress = str(a, 'egress');
    if (num(a, 'bedrooms') > 0 && egress !== 'yes') {
      out.push({ id: 'egress', level: 'warn',
        title: egress === 'no' ? 'Basement bedroom without egress window' : 'Confirm egress for every basement bedroom',
        detail: 'Each basement bedroom needs an emergency escape opening. An egress window cut-in is not included in this price.' });
    }
    if (has('slab_trench')) {
      out.push({ id: 'trench', level: 'info', title: `Slab cut and trench included (${qty('slab_trench')} LF)`,
        detail: 'Confirm the main drain is deep enough for gravity flow. A sewage ejector pump is not included.' });
    }
  }

  if (input.jobTypeId === 'bathroom' && str(a, 'showerType') !== 'none' && !yes(a, 'bathFan')) {
    out.push({ id: 'fan', level: 'warn', title: 'No new bath fan in a bathroom with a shower or tub',
      detail: 'Confirm an existing fan is vented to the outside, or add one. Inspectors check this.' });
  }
  if (has('vent_bath_fan')) {
    out.push({ id: 'fan_added', level: 'info', title: `Bath exhaust fan${qty('vent_bath_fan') > 1 ? 's' : ''} included (${qty('vent_bath_fan')})`,
      detail: 'Vented to the exterior with ducting and switch.' });
  }
  if (has('elec_smoke')) {
    out.push({ id: 'smoke', level: 'info', title: `Smoke/CO detectors included (${qty('elec_smoke')})`,
      detail: 'One per bedroom plus the hallway, hardwired.' });
  }
  if (has('elec_range_50a')) {
    out.push({ id: 'range', level: 'info', title: '50A range circuit uses 6/3 copper',
      detail: `${qty('elec_run_63')} ft of 6/3 NM-B included. 10 gauge is only for the 30A dryer.` });
  }
  if (has('elec_range_50a') || has('elec_dryer_30a')) {
    out.push({ id: 'panel', level: 'warn', title: 'Check panel capacity for new 240V circuits',
      detail: 'Confirm open breaker spaces and service size. A panel or service upgrade is not included.' });
  }
  if (has('vent_range_hood') && str(a, 'foundation') === 'basement') {
    out.push({ id: 'core', level: 'info', title: 'Range vent may need a core drill',
      detail: 'If the vent exits through a concrete foundation wall, add core drilling.' });
  }

  const permitTrades = scope.some((s) => /^(plumb_|elec_|frame_|vent_|slab_)/.test(s.assemblyId));
  if (permitTrades || input.jobTypeId === 'adu' || input.jobTypeId === 'newbuild') {
    out.push({ id: 'permit', level: 'info', title: 'Permit likely required',
      detail: 'Permit fees are listed as not included. Confirm with the city before scheduling.' });
  }

  if (input.mode === 'quick' || !jt.detailed) {
    out.push({ id: 'quick', level: 'info', title: 'Quick estimate based on $/SF',
      detail: 'Uses your price per SF for this job type and finish level. Switch to Detailed for a trade breakdown and material list.' });
  }

  if (!(input.salesTaxPct > 0)) {
    out.push({ id: 'tax', level: 'warn', title: 'Sales tax rate not set',
      detail: 'Set your sales tax rate in Settings so the client total is correct.' });
  }

  return out.sort((x, y) => (x.level === y.level ? 0 : x.level === 'warn' ? -1 : 1));
}
