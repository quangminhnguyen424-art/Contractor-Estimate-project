-- Ready for many users: a cap on total AI use per day (protects the bill), old usage counts cleaned up,
-- and an index for the client-notes check every phone runs on each sync.

create table if not exists public.ai_usage_total (
  day date primary key,
  requests integer not null default 0
);
alter table public.ai_usage_total enable row level security; -- no policies: only the server reads or writes it

-- One AI request: counts it for the user and for the whole service. False when either limit is reached.
create or replace function public.use_ai_capped(p_user uuid, p_limit int, p_total_limit int)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int; t int;
begin
  insert into public.ai_usage (user_id, day, requests) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set requests = public.ai_usage.requests + 1
  returning requests into n;
  if n > p_limit then return false; end if;
  insert into public.ai_usage_total (day, requests) values (current_date, 1)
  on conflict (day) do update set requests = public.ai_usage_total.requests + 1
  returning requests into t;
  -- Usage counts are kept 90 days (as the Privacy Policy says); clean up now and then.
  if random() < 0.001 then delete from public.ai_usage where day < current_date - 90; end if;
  return p_total_limit <= 0 or t <= p_total_limit;
end $$;
revoke all on function public.use_ai_capped(uuid, int, int) from public, anon, authenticated;

create index if not exists sign_requests_notes on public.sign_requests (owner) where note_seen = false and client_note_at is not null;
