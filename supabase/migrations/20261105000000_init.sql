-- Bidwell AI cloud: each contractor's data, private job photos, online signatures and AI usage limits.

create extension if not exists pgcrypto with schema extensions;

-- One row per account: the app's whole saved data (estimates, jobs, contracts, calendar…), kept in step with the phone.
create table if not exists public.workspaces (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  device text not null default ''
);
alter table public.workspaces enable row level security;
create policy "own workspace: read" on public.workspaces for select using (auth.uid() = user_id);
create policy "own workspace: add" on public.workspaces for insert with check (auth.uid() = user_id);
create policy "own workspace: change" on public.workspaces for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own workspace: remove" on public.workspaces for delete using (auth.uid() = user_id);

-- A quote or change order sent to a client to sign online. The client opens a link with the token; nothing else
-- of the contractor's data is reachable from it.
create table if not exists public.sign_requests (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  owner uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('quote', 'change')),
  estimate_id text not null,
  change_id text,
  title text not null,
  company text not null default '',
  client_name text not null default '',
  total numeric not null,
  html text not null,
  status text not null default 'pending' check (status in ('pending', 'signed', 'cancelled')),
  signature jsonb,
  signed_at timestamptz,
  applied boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);
create index if not exists sign_requests_owner on public.sign_requests (owner, status, applied);
alter table public.sign_requests enable row level security;
create policy "own sign requests: read" on public.sign_requests for select using (auth.uid() = owner);
create policy "own sign requests: add" on public.sign_requests for insert with check (auth.uid() = owner);
create policy "own sign requests: change" on public.sign_requests for update using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "own sign requests: remove" on public.sign_requests for delete using (auth.uid() = owner);

-- What the client's signing page can see: only this one document, by its token, while it is open.
create or replace function public.get_sign_request(p_token text)
returns table (kind text, title text, company text, client_name text, total numeric, html text, status text, signed_at timestamptz, expired boolean)
language sql security definer set search_path = public stable as $$
  select r.kind, r.title, r.company, r.client_name, r.total, r.html, r.status, r.signed_at, (r.expires_at < now())
  from public.sign_requests r where r.token = p_token and r.status <> 'cancelled' limit 1;
$$;

-- The client signs: only once, only before it expires, and only with a real signature.
create or replace function public.submit_signature(p_token text, p_name text, p_strokes jsonb, p_w numeric, p_h numeric)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if coalesce(length(trim(p_name)), 0) < 2 or length(p_name) > 80 then raise exception 'name required'; end if;
  if jsonb_typeof(p_strokes) <> 'array' or jsonb_array_length(p_strokes) = 0 or length(p_strokes::text) > 200000 then raise exception 'signature required'; end if;
  if p_w <= 0 or p_w > 5000 or p_h <= 0 or p_h > 5000 then raise exception 'bad size'; end if;
  update public.sign_requests
     set status = 'signed', signed_at = now(),
         signature = jsonb_build_object('name', trim(p_name), 'strokes', p_strokes, 'w', p_w, 'h', p_h, 'signedAt', now())
   where token = p_token and status = 'pending' and expires_at > now();
  get diagnostics n = row_count;
  return n = 1;
end $$;

revoke all on function public.get_sign_request(text) from public;
revoke all on function public.submit_signature(text, text, jsonb, numeric, numeric) from public;
grant execute on function public.get_sign_request(text) to anon, authenticated;
grant execute on function public.submit_signature(text, text, jsonb, numeric, numeric) to anon, authenticated;

-- AI requests per account per day, so a shared key can't run up a bill.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  requests int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
create policy "own usage: read" on public.ai_usage for select using (auth.uid() = user_id);

-- Counts one AI request; returns false when today's limit is reached. Called by the AI function only.
create or replace function public.use_ai(p_user uuid, p_limit int)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.ai_usage (user_id, day, requests) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set requests = public.ai_usage.requests + 1
  returning requests into n;
  return n <= p_limit;
end $$;
revoke all on function public.use_ai(uuid, int) from public, anon, authenticated;

-- Private job photos: each account can only see and change files in its own folder (<user id>/…).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 8388608, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;
create policy "own photos: read" on storage.objects for select using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos: add" on storage.objects for insert with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos: change" on storage.objects for update using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos: remove" on storage.objects for delete using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
