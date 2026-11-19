-- Team plan: up to 3 people (the owner + 2) work in one company account: the same jobs, quotes, photos, schedule
-- and signatures. The owner invites by email; the person enters the 8-character code from the invite.
-- A member's own work stays in their own row and comes back if they leave the team.

create table if not exists public.team_members (
  member uuid primary key references auth.users (id) on delete cascade, -- one team per person
  owner uuid not null references auth.users (id) on delete cascade,
  email text not null default '',
  joined_at timestamptz not null default now(),
  check (member <> owner)
);
create index if not exists team_members_owner on public.team_members (owner);
alter table public.team_members enable row level security;
drop policy if exists "team: read" on public.team_members;
create policy "team: read" on public.team_members for select using (auth.uid() = member or auth.uid() = owner);

create table if not exists public.team_invites (
  code text primary key,
  owner uuid not null references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
create index if not exists team_invites_owner on public.team_invites (owner);
alter table public.team_invites enable row level security;
drop policy if exists "team invites: read" on public.team_invites;
create policy "team invites: read" on public.team_invites for select using (auth.uid() = owner);

-- Whose workspace a person works in: their team owner's, or their own.
create or replace function public.workspace_of(p_user uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce((select owner from public.team_members where member = p_user), p_user);
$$;
revoke all on function public.workspace_of(uuid) from public, anon;
grant execute on function public.workspace_of(uuid) to authenticated;

create or replace function public.my_workspace()
returns uuid language sql stable security definer set search_path = public as $$
  select public.workspace_of(auth.uid());
$$;
revoke all on function public.my_workspace() from public, anon;
grant execute on function public.my_workspace() to authenticated;

-- Members read and change the owner's workspace, photos and signing links.
drop policy if exists "team workspace: read" on public.workspaces;
create policy "team workspace: read" on public.workspaces for select using (user_id = public.workspace_of(auth.uid()));
drop policy if exists "team workspace: change" on public.workspaces;
create policy "team workspace: change" on public.workspaces for update
  using (user_id = public.workspace_of(auth.uid())) with check (user_id = public.workspace_of(auth.uid()));

drop policy if exists "team photos: read" on storage.objects;
create policy "team photos: read" on storage.objects for select using (bucket_id = 'photos' and (storage.foldername(name))[1] = public.workspace_of(auth.uid())::text);
drop policy if exists "team photos: add" on storage.objects;
create policy "team photos: add" on storage.objects for insert with check (bucket_id = 'photos' and (storage.foldername(name))[1] = public.workspace_of(auth.uid())::text);
drop policy if exists "team photos: change" on storage.objects;
create policy "team photos: change" on storage.objects for update using (bucket_id = 'photos' and (storage.foldername(name))[1] = public.workspace_of(auth.uid())::text);
drop policy if exists "team photos: remove" on storage.objects;
create policy "team photos: remove" on storage.objects for delete using (bucket_id = 'photos' and (storage.foldername(name))[1] = public.workspace_of(auth.uid())::text);

drop policy if exists "team sign requests: read" on public.sign_requests;
create policy "team sign requests: read" on public.sign_requests for select using (owner = public.workspace_of(auth.uid()));
drop policy if exists "team sign requests: add" on public.sign_requests;
create policy "team sign requests: add" on public.sign_requests for insert with check (owner = public.workspace_of(auth.uid()));
drop policy if exists "team sign requests: change" on public.sign_requests;
create policy "team sign requests: change" on public.sign_requests for update
  using (owner = public.workspace_of(auth.uid())) with check (owner = public.workspace_of(auth.uid()));

-- A member's plan is the owner's Team plan (or Free if the owner's plan has ended). Replaces the earlier version.
create or replace function public.plan_for(p_user uuid)
returns text language plpgsql security definer set search_path = public as $$
declare r public.plans; on_ boolean; o uuid;
begin
  select plans_on into on_ from public.app_settings where id;
  if not coalesce(on_, false) then return 'beta'; end if;
  select owner into o from public.team_members where member = p_user;
  if o is not null then
    return case when public.plan_for(o) = 'team' then 'team' else 'free' end;
  end if;
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

create or replace function public.my_plan()
returns json language plpgsql security definer set search_path = public as $$
declare p text; r public.plans; o uuid;
begin
  if auth.uid() is null then return null; end if;
  p := public.plan_for(auth.uid());
  select owner into o from public.team_members where member = auth.uid();
  select * into r from public.plans where user_id = auth.uid();
  return json_build_object('plan', p, 'status', r.status, 'trial_ends_at', r.trial_ends_at, 'paid_until', r.paid_until,
    'cancel_at_period_end', coalesce(r.cancel_at_period_end, false), 'had_trial', coalesce(r.had_trial, false),
    'has_billing', r.stripe_customer_id is not null, 'team_member', o is not null);
end $$;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- The owner invites someone by email. Needs the Team plan (or the beta); at most 2 people besides the owner.
create or replace function public.create_team_invite(p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c text; seats int;
begin
  if me is null then raise exception 'sign in first'; end if;
  if exists (select 1 from public.team_members where member = me) then raise exception 'You are on another company''s team. Leave it first to make your own.'; end if;
  if public.plan_for(me) not in ('team', 'beta') then raise exception 'Sharing your account needs the Team plan.'; end if;
  p_email := lower(trim(p_email));
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email.'; end if;
  if p_email = lower(coalesce(auth.jwt() ->> 'email', '')) then raise exception 'That is your own email.'; end if;
  delete from public.team_invites where owner = me and (expires_at < now() or email = p_email);
  select (select count(*) from public.team_members where owner = me) + (select count(*) from public.team_invites where owner = me) into seats;
  if seats >= 2 then raise exception 'Your team is full: you plus 2 people. Remove someone or cancel an invite first.'; end if;
  c := upper(encode(extensions.gen_random_bytes(4), 'hex'));
  insert into public.team_invites (code, owner, email) values (c, me, p_email);
  return c;
end $$;

-- The invited person joins with the code, from the account with the invited email.
create or replace function public.join_team(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); inv public.team_invites; mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if me is null then raise exception 'sign in first'; end if;
  select * into inv from public.team_invites where code = upper(trim(p_code)) and expires_at > now();
  if inv.code is null then raise exception 'That code is not right or has expired. Ask for a new invite.'; end if;
  if inv.email <> mail then raise exception 'This invite is for %. Log in with that email to join.', inv.email; end if;
  if inv.owner = me then raise exception 'That is your own invite.'; end if;
  if exists (select 1 from public.team_members where member = me) then raise exception 'You are already on a team. Leave it first.'; end if;
  if exists (select 1 from public.team_members where owner = me) then raise exception 'Your own account has people on it. Remove them first.'; end if;
  if (select count(*) from public.team_members where owner = inv.owner) >= 2 then raise exception 'That team is full.'; end if;
  insert into public.team_members (member, owner, email) values (me, inv.owner, mail);
  delete from public.team_invites where code = inv.code;
  return inv.owner;
end $$;

create or replace function public.leave_team()
returns void language sql security definer set search_path = public as $$
  delete from public.team_members where member = auth.uid();
$$;

create or replace function public.remove_team_member(p_member uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.team_members where owner = auth.uid() and member = p_member;
$$;

create or replace function public.cancel_team_invite(p_code text)
returns void language sql security definer set search_path = public as $$
  delete from public.team_invites where owner = auth.uid() and code = p_code;
$$;

-- What the Team screen shows: am I alone, the owner, or a member; who is on the team; open invites.
create or replace function public.my_team()
returns json language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); o uuid;
begin
  if me is null then return null; end if;
  select owner into o from public.team_members where member = me;
  if o is not null then
    return json_build_object('role', 'member', 'owner', o,
      'owner_email', (select email from auth.users where id = o),
      'members', coalesce((select json_agg(json_build_object('member', member, 'email', email, 'joined_at', joined_at) order by joined_at)
        from public.team_members where owner = o), '[]'::json),
      'invites', '[]'::json);
  end if;
  return json_build_object('role', case when exists (select 1 from public.team_members where owner = me) then 'owner' else 'solo' end,
    'owner', me, 'owner_email', (select email from auth.users where id = me),
    'members', coalesce((select json_agg(json_build_object('member', member, 'email', email, 'joined_at', joined_at) order by joined_at)
      from public.team_members where owner = me), '[]'::json),
    'invites', coalesce((select json_agg(json_build_object('code', code, 'email', email, 'expires_at', expires_at) order by created_at)
      from public.team_invites where owner = me and expires_at > now()), '[]'::json));
end $$;

do $$ begin
  revoke all on function public.create_team_invite(text) from public, anon;
  revoke all on function public.join_team(text) from public, anon;
  revoke all on function public.leave_team() from public, anon;
  revoke all on function public.remove_team_member(uuid) from public, anon;
  revoke all on function public.cancel_team_invite(text) from public, anon;
  revoke all on function public.my_team() from public, anon;
  grant execute on function public.create_team_invite(text) to authenticated;
  grant execute on function public.join_team(text) to authenticated;
  grant execute on function public.leave_team() to authenticated;
  grant execute on function public.remove_team_member(uuid) to authenticated;
  grant execute on function public.cancel_team_invite(text) to authenticated;
  grant execute on function public.my_team() to authenticated;
end $$;
