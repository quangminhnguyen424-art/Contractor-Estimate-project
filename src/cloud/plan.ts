// The account's plan: Free (no AI), a 14-day trial of Pro, Pro or Team. Kept on the server (public.plans).
import { supabase } from './client';

export type PlanName = 'free' | 'trial' | 'pro' | 'team';
export interface MyPlan { plan: PlanName; trial_ends_at: string | null; paid_until: string | null }

/** The plan in force now, or null when it can't be read (signed out, offline, or plans not set up on the server yet). */
export async function getMyPlan(): Promise<MyPlan | null> {
  try {
    const { data, error } = await supabase.rpc('my_plan');
    if (error || !data) return null;
    return data as MyPlan;
  } catch {
    return null;
  }
}

/** Whole days left in the trial (0 on its last day or after). */
export const trialDaysLeft = (p: MyPlan, now = Date.now()) =>
  p.trial_ends_at ? Math.max(0, Math.ceil((Date.parse(p.trial_ends_at) - now) / 864e5)) : 0;
