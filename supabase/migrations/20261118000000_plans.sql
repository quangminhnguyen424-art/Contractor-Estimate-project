-- Plans. Every account picks Starter ($19), Pro ($39) or Team ($79) a month, or yearly at 20% off ($182, $374, $758), and enters a card at Stripe; the first 14 days
-- are free and Stripe charges on day 15 unless the subscription is cancelled. Cancelled or unpaid = Free: no AI, data kept.
-- Stripe tells us about every change through the stripe-webhook function, which writes this table.
--
-- The switch: until app_settings.plans_on is true (the beta) everyone gets AI and nobody is asked to pick a plan.
--   update public.app_settings set plans_on = true;
-- To give someone a plan by hand (a tester, yourself), with no end date:
--   update public.plans set plan = 'pro', status = 'manual', paid_until = null where user_id = '…';

create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  plans_on boolean not null default false
);
insert into public.app_settings (id) values (true) on conflict (id) do nothing;
alter table public.app_settings enable row level security; -- read only through the functions below

create table if not exists public.plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- none = never picked a plan; free = had one, cancelled or unpaid.
  plan text not null default 'none' check (plan in ('none', 'free', 'starter', 'pro', 'team')),
  -- Stripe's subscription status (trialing, active, past_due, canceled…), or 'manual' for a plan given by hand.
  status text,
  trial_ends_at timestamptz,
  -- Paid (or in trial) through this time; null with status 'manual' = no end.
  paid_until timestamptz,
  cancel_at_period_end boolean not null default false,
  had_trial boolean not null default false,
  stripe_customer_id text,
  stripe_subscription_id text,
  updated_at timestamptz not null default now()
);
-- Upgrades a table made by the first version of this file.
alter table public.plans drop constraint if exists plans_plan_check;
update public.plans set plan = 'none' where plan not in ('none', 'free', 'starter', 'pro', 'team');
alter table public.plans add constraint plans_plan_check check (plan in ('none', 'free', 'starter', 'pro', 'team'));
alter table public.plans alter column plan set default 'none';
alter table public.plans alter column trial_ends_at drop not null;
alter table public.plans alter column trial_ends_at drop default;
alter table public.plans add column if not exists status text;
alter table public.plans add column if not exists cancel_at_period_end boolean not null default false;
alter table public.plans add column if not exists had_trial boolean not null default false;
alter table public.plans add column if not exists stripe_subscription_id text;
create index if not exists plans_stripe_customer on public.plans (stripe_customer_id);
alter table public.plans enable row level security;
drop policy if exists "own plan: read" on public.plans;
create policy "own plan: read" on public.plans for select using (auth.uid() = user_id);

-- The plan in force now: 'starter' | 'pro' | 'team' | 'free' | 'none', or 'beta' while plans are off.
create or replace function public.plan_for(p_user uuid)
returns text language plpgsql security definer set search_path = public as $$
declare r public.plans; on_ boolean;
begin
  select plans_on into on_ from public.app_settings where id;
  if not coalesce(on_, false) then return 'beta'; end if;
  insert into public.plans (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into r from public.plans where user_id = p_user;
  if r.plan in ('starter', 'pro', 'team')
     and (r.status = 'manual' or (r.status in ('trialing', 'active', 'past_due') and (r.paid_until is null or r.paid_until > now()))) then
    return r.plan;
  end if;
  if r.plan = 'none' then return 'none'; end if;
  return 'free';
end $$;
revoke all on function public.plan_for(uuid) from public, anon, authenticated;

-- What the app shows under Me → Your plan, and whether it must ask for a plan first.
create or replace function public.my_plan()
returns json language plpgsql security definer set search_path = public as $$
declare p text; r public.plans;
begin
  if auth.uid() is null then return null; end if;
  p := public.plan_for(auth.uid());
  select * into r from public.plans where user_id = auth.uid();
  return json_build_object('plan', p, 'status', r.status, 'trial_ends_at', r.trial_ends_at, 'paid_until', r.paid_until,
    'cancel_at_period_end', coalesce(r.cancel_at_period_end, false), 'had_trial', coalesce(r.had_trial, false),
    'has_billing', r.stripe_customer_id is not null);
end $$;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;
