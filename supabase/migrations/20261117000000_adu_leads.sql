-- ADU check page: each contractor gets a public page where homeowners check what they can build on their lot.
-- The page shows the contractor's name, contact and price range; a homeowner who asks for the full report becomes a lead.

create table if not exists public.adu_pages (
  owner uuid primary key references auth.users (id) on delete cascade,
  code text not null unique default encode(extensions.gen_random_bytes(5), 'hex'),
  active boolean not null default true,
  company text not null default '' check (char_length(company) <= 120),
  phone text not null default '' check (char_length(phone) <= 40),
  email text not null default '' check (char_length(email) <= 120),
  logo text check (logo is null or char_length(logo) <= 60000),
  lang text not null default 'en' check (lang in ('en', 'vi')),
  -- The contractor's own price per SF for a new ADU (low and high finish); hidden when show_prices is false.
  price_low numeric check (price_low is null or (price_low >= 0 and price_low < 5000)),
  price_high numeric check (price_high is null or (price_high >= 0 and price_high < 5000)),
  show_prices boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.adu_pages enable row level security;
drop policy if exists "own adu page: read" on public.adu_pages;
create policy "own adu page: read" on public.adu_pages for select using (auth.uid() = owner);
drop policy if exists "own adu page: add" on public.adu_pages;
create policy "own adu page: add" on public.adu_pages for insert with check (auth.uid() = owner);
drop policy if exists "own adu page: change" on public.adu_pages;
create policy "own adu page: change" on public.adu_pages for update using (auth.uid() = owner) with check (auth.uid() = owner);
drop policy if exists "own adu page: remove" on public.adu_pages;
create policy "own adu page: remove" on public.adu_pages for delete using (auth.uid() = owner);

create table if not exists public.adu_leads (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 120),
  phone text not null default '' check (char_length(phone) <= 40),
  email text not null default '' check (char_length(email) <= 120),
  address text not null default '' check (char_length(address) <= 200),
  pin text not null default '' check (char_length(pin) <= 20),
  city text not null default '' check (char_length(city) <= 60),
  zoning text not null default '' check (char_length(zoning) <= 40),
  lot_sqft integer check (lot_sqft is null or lot_sqft between 0 and 100000000),
  verdict text not null default '' check (char_length(verdict) <= 20),
  size_sf integer check (size_sf is null or size_sf between 0 and 10000),
  message text not null default '' check (char_length(message) <= 2000),
  lang text not null default 'en' check (char_length(lang) <= 10),
  seen boolean not null default false
);
alter table public.adu_leads enable row level security;
drop policy if exists "own adu leads: read" on public.adu_leads;
create policy "own adu leads: read" on public.adu_leads for select using (auth.uid() = owner);
drop policy if exists "own adu leads: change" on public.adu_leads;
create policy "own adu leads: change" on public.adu_leads for update using (auth.uid() = owner) with check (auth.uid() = owner);
drop policy if exists "own adu leads: remove" on public.adu_leads;
create policy "own adu leads: remove" on public.adu_leads for delete using (auth.uid() = owner);
create index if not exists adu_leads_owner on public.adu_leads (owner, created_at desc);

-- What the public page can see: only the contractor's name, contact and prices, by the page code, while it is on.
create or replace function public.get_adu_page(p_code text)
returns table (company text, phone text, email text, logo text, lang text, price_low numeric, price_high numeric)
language sql security definer set search_path = public stable as $$
  select p.company, p.phone, p.email, p.logo, p.lang,
         case when p.show_prices then p.price_low end, case when p.show_prices then p.price_high end
  from public.adu_pages p where p.code = p_code and p.active limit 1;
$$;

-- A homeowner asks for the full report: saved as a lead for that contractor. At most 30 an hour per page.
create or replace function public.submit_adu_lead(p_code text, p_name text, p_phone text, p_email text, p_address text, p_pin text,
  p_city text, p_zoning text, p_lot integer, p_verdict text, p_size integer, p_message text, p_lang text)
returns boolean language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  select owner into o from public.adu_pages where code = p_code and active;
  if o is null then return false; end if;
  if coalesce(length(trim(p_name)), 0) < 1 or (coalesce(length(trim(p_phone)), 0) < 7 and coalesce(p_email, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'name and phone or email required';
  end if;
  if (select count(*) from public.adu_leads where owner = o and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too many requests';
  end if;
  insert into public.adu_leads (owner, name, phone, email, address, pin, city, zoning, lot_sqft, verdict, size_sf, message, lang)
  values (o, left(trim(p_name), 120), left(coalesce(trim(p_phone), ''), 40), left(coalesce(trim(p_email), ''), 120), left(coalesce(p_address, ''), 200),
          left(coalesce(p_pin, ''), 20), left(coalesce(p_city, ''), 60), left(coalesce(p_zoning, ''), 40), p_lot, left(coalesce(p_verdict, ''), 20),
          p_size, left(coalesce(p_message, ''), 2000), left(coalesce(p_lang, 'en'), 10));
  return true;
end $$;

revoke all on function public.get_adu_page(text) from public;
revoke all on function public.submit_adu_lead(text, text, text, text, text, text, text, text, integer, text, integer, text, text) from public;
grant execute on function public.get_adu_page(text) to anon, authenticated;
grant execute on function public.submit_adu_lead(text, text, text, text, text, text, text, text, integer, text, integer, text, text) to anon, authenticated;
