// The account's plan, kept on the server (public.plans) and paid through Stripe.
// none = hasn't picked a plan yet · free = no AI · starter/pro/team = paid (14 days free first) · beta = plans not switched on yet.
import { callFunction, supabase } from './client';

export type PlanName = 'none' | 'free' | 'starter' | 'pro' | 'team' | 'beta';
export type PaidPlan = 'starter' | 'pro' | 'team';
export type Interval = 'month' | 'year';
export interface MyPlan {
  plan: PlanName;
  status: string | null;
  trial_ends_at: string | null;
  paid_until: string | null;
  cancel_at_period_end: boolean;
  had_trial: boolean;
  has_billing: boolean;
  /** On someone else's Team: the plan comes from the owner, who manages billing. */
  team_member?: boolean;
}

/** Yearly = 12 months less 20%, rounded down to the dollar. */
export const YEAR_DISCOUNT = 0.2;
export const yearPrice = (monthly: number) => Math.floor(monthly * 12 * (1 - YEAR_DISCOUNT));

export const PLANS: { id: PaidPlan; name: string; price: number; aiPerDay: number; items: string[] }[] = [
  { id: 'starter', name: 'Starter', price: 19, aiPerDay: 10, items: ['Studwise AI: 10 requests a day', 'Talk or type a job, get the estimate', 'Quotes, contracts, signing, invoices'] },
  { id: 'pro', name: 'Pro', price: 39, aiPerDay: 25, items: ['Studwise AI: 25 requests a day', 'Scope, client messages and permit descriptions', 'Quotes in your client’s language, crew work orders in theirs'] },
  { id: 'team', name: 'Team', price: 79, aiPerDay: 25, items: ['Everything in Pro', 'Up to 3 people share one company account: same jobs, quotes, photos and schedule', 'Studwise AI: 25 requests a day for each person', 'Priority help'] },
];

/** The plan in force now, or null when it can't be read (signed out, offline, or plans not set up on the server yet). */
export async function getMyPlan(): Promise<MyPlan | null> {
  try {
    const { data, error } = await supabase.rpc('my_plan');
    if (error || !data) return null;
    const row = (Array.isArray(data) ? data[0] : data) as MyPlan | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

/** Whole days left in the trial (0 on its last day or after). */
export const trialDaysLeft = (p: MyPlan, now = Date.now()) =>
  p.trial_ends_at ? Math.max(0, Math.ceil((Date.parse(p.trial_ends_at) - now) / 864e5)) : 0;

/** Stripe Checkout for a plan (card first; 14 days free the first time). Returns the page to open. */
export const startCheckout = (plan: PaidPlan, interval: Interval = 'month') => callFunction<{ url: string }>('billing', { action: 'checkout', plan, interval });
/** Stripe's billing page: change plan, update the card, or cancel. */
export const openBillingPortal = () => callFunction<{ url: string }>('billing', { action: 'portal' });

/** The date the first charge happens if someone starts a trial today. */
export const firstChargeDate = (now = new Date()) => new Date(now.getTime() + 14 * 864e5);
