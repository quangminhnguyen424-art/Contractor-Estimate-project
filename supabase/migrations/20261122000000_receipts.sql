-- Receipts by mail: each company account gets an address (r-<code>@in.studwise.ai). Mail sent there is read by the
-- `receipts-in` function, and what it read (store, date, items, amounts, job name) waits in receipt_mail until the
-- company's phones take it into their receipts inbox. No card or bank detail is stored: the function drops anything
-- that is not a receipt field before saving, and the original mail is not kept (a photo of a paper receipt is, in the
-- company's own photo folder, like a receipt snapped in the app).
--
-- The switch: mail-in stays off until the mail domain and the provider are set up. Then run:
--   update public.app_settings set receipts_mail_on = true;

alter table public.app_settings add column if not exists receipts_mail_on boolean not null default false;

create table if not exists public.receipt_addresses (
  token text primary key check (token ~ '^[a-z0-9]{12}$'),
  owner uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.receipt_addresses enable row level security; -- reached only through the functions below
revoke all on public.receipt_addresses from anon, authenticated;

-- Every mail the function has started on, so a delivery repeated by the provider is read once, and so mail to one
-- address can be capped per day.
create table if not exists public.receipt_mail_seen (
  mail_id text primary key,
  owner uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists receipt_mail_seen_owner_at on public.receipt_mail_seen (owner, at);
alter table public.receipt_mail_seen enable row level security; -- the function only
revoke all on public.receipt_mail_seen from anon, authenticated;

create table if not exists public.receipt_mail (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  mail_id text not null,
  part int not null default 0,              -- a store's purchase file holds several purchases: one row each
  kind text not null default 'email' check (kind in ('email', 'file')),
  read jsonb,                                -- what was read; null when no receipt could be read from the mail
  mail_from text check (char_length(mail_from) <= 200),
  subject text check (char_length(subject) <= 200),
  photo text check (photo ~ '^[A-Za-z0-9_-]{1,80}\.jpg$'), -- file name under photos/<owner>/
  created_at timestamptz not null default now(),
  taken_at timestamptz,                      -- when a phone of the account took it into the inbox
  unique (mail_id, part)
);
create index if not exists receipt_mail_waiting on public.receipt_mail (owner, created_at) where taken_at is null;
alter table public.receipt_mail enable row level security;

-- The company (the owner and the team) reads its rows, marks them taken, and may delete them. Only the function adds.
revoke all on public.receipt_mail from anon, authenticated;
grant select, delete on public.receipt_mail to authenticated;
grant update (taken_at) on public.receipt_mail to authenticated;
drop policy if exists "receipt mail: read" on public.receipt_mail;
create policy "receipt mail: read" on public.receipt_mail for select using (owner = public.workspace_of(auth.uid()));
drop policy if exists "receipt mail: take" on public.receipt_mail;
create policy "receipt mail: take" on public.receipt_mail for update
  using (owner = public.workspace_of(auth.uid())) with check (owner = public.workspace_of(auth.uid()));
drop policy if exists "receipt mail: remove" on public.receipt_mail;
create policy "receipt mail: remove" on public.receipt_mail for delete using (owner = public.workspace_of(auth.uid()));

-- The caller's company address code, made on first use. Null while mail-in is switched off.
create or replace function public.my_receipt_address()
returns text language plpgsql security definer set search_path = public as $$
declare ws uuid; t text; on_ boolean;
begin
  if auth.uid() is null then return null; end if;
  select receipts_mail_on into on_ from public.app_settings where id;
  if not coalesce(on_, false) then return null; end if;
  ws := public.workspace_of(auth.uid());
  select token into t from public.receipt_addresses where owner = ws;
  if t is not null then return t; end if;
  for i in 1..5 loop
    t := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    begin
      insert into public.receipt_addresses (token, owner) values (t, ws);
      return t;
    exception when unique_violation then
      select token into t from public.receipt_addresses where owner = ws; -- another phone made it a moment ago
      if t is not null then return t; end if;
    end;
  end loop;
  return null;
end $$;
revoke all on function public.my_receipt_address() from public, anon;
grant execute on function public.my_receipt_address() to authenticated;

-- Retires the company's address (mail to it is dropped from now on) and gives a new one. The owner only.
create or replace function public.new_receipt_address()
returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.workspace_of(auth.uid()) <> auth.uid() then return null; end if;
  delete from public.receipt_addresses where owner = auth.uid();
  return public.my_receipt_address();
end $$;
revoke all on function public.new_receipt_address() from public, anon;
grant execute on function public.new_receipt_address() to authenticated;
