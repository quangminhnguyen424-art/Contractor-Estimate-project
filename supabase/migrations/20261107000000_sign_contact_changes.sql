-- Signing page: the contractor's phone, email and payment link for the client, and "Request changes" from the client.
alter table public.sign_requests
  add column if not exists company_phone text check (char_length(company_phone) <= 40),
  add column if not exists company_email text check (char_length(company_email) <= 120),
  add column if not exists pay_link text check (pay_link is null or (pay_link ~ '^https://' and char_length(pay_link) <= 300)),
  add column if not exists client_note text check (char_length(client_note) <= 2000),
  add column if not exists client_note_name text check (char_length(client_note_name) <= 120),
  add column if not exists client_note_at timestamptz,
  add column if not exists note_seen boolean not null default false;

drop function if exists public.get_sign_request(text);
create or replace function public.get_sign_request(p_token text)
returns table (kind text, title text, company text, client_name text, total numeric, html text, status text, signed_at timestamptz, expired boolean,
               company_phone text, company_email text, pay_link text, client_note_at timestamptz)
language sql security definer set search_path = public stable as $$
  select r.kind, r.title, r.company, r.client_name, r.total, r.html, r.status, r.signed_at, (r.expires_at < now()),
         r.company_phone, r.company_email, r.pay_link, r.client_note_at
  from public.sign_requests r where r.token = p_token and r.status <> 'cancelled' limit 1;
$$;

-- The client asks for changes instead of signing. Only on an open link; a newer note replaces the older one.
create or replace function public.request_changes(p_token text, p_name text, p_message text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if coalesce(length(trim(p_message)), 0) < 3 or length(p_message) > 2000 or coalesce(length(trim(p_name)), 0) < 1 or length(p_name) > 120 then
    return false;
  end if;
  update public.sign_requests r
     set client_note = trim(p_message), client_note_name = trim(p_name), client_note_at = now(), note_seen = false
   where r.token = p_token and r.status = 'pending' and r.expires_at > now();
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke all on function public.get_sign_request(text) from public;
revoke all on function public.request_changes(text, text, text) from public;
grant execute on function public.get_sign_request(text) to anon, authenticated;
grant execute on function public.request_changes(text, text, text) to anon, authenticated;
