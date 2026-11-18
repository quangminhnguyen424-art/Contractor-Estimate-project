-- Plans: Free (no AI, so it costs about nothing), a 14-day Pro trial for every new account, Pro and Team.
-- The AI function asks plan_for() before each request once PLANS_ON=1 is set on it; until then (beta) everyone has AI.
-- To give someone Pro by hand (a tester, yourself): update public.plans set plan = 'pro', paid_until = null where user_id = '…';

create table if not exists public.plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'trial' check (plan in ('free', 'trial', 'pro', 'team')),
  trial_ends_at timestamptz not null default now() + interval '14 days',
  -- Pro or Team paid through this time; null with plan pro/team = given by hand, no end.
  paid_until timestamptz,
  stripe_customer_id text,
  updated_at timestamptz not null default now()
);
alter table public.plans enable row level security;
drop policy if exists "own plan: read" on public.plans;
create policy "own plan: read" on public.plans for select using (auth.uid() = user_id);

-- The plan in force right now: 'pro' | 'team' | 'trial' | 'free'. Starts the trial on first use.
create or replace function public.plan_for(p_user uuid)
returns text language plpgsql security definer set search_path = public as $$
declare r public.plans;
begin
  insert into public.plans (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into r from public.plans where user_id = p_user;
  if r.plan in ('pro', 'team') and (r.paid_until is null or r.paid_until > now()) then return r.plan; end if;
  if r.trial_ends_at > now() then return 'trial'; end if;
  return 'free';
end $$;
revoke all on function public.plan_for(uuid) from public, anon, authenticated;

-- What the app shows under Me → Your plan.
create or replace function public.my_plan()
returns json language plpgsql security definer set search_path = public as $$
declare p text; r public.plans;
begin
  if auth.uid() is null then return null; end if;
  p := public.plan_for(auth.uid());
  select * into r from public.plans where user_id = auth.uid();
  return json_build_object('plan', p, 'trial_ends_at', r.trial_ends_at, 'paid_until', r.paid_until);
end $$;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;
