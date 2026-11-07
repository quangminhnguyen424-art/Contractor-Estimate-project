-- Problem reports and questions sent from the app's Help screen.
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email text,
  kind text not null check (kind in ('bug', 'question', 'billing', 'idea', 'other')),
  message text not null check (char_length(message) between 3 and 4000),
  device text check (char_length(device) <= 300),
  screenshot text check (char_length(screenshot) <= 200), -- path in the private "photos" bucket
  status text not null default 'new' check (status in ('new', 'answered', 'closed')),
  created_at timestamptz not null default now()
);
alter table public.support_tickets enable row level security;

-- Contractors can send reports and see their own; only the owner (service role / dashboard) answers them.
create policy "send own tickets" on public.support_tickets for insert to authenticated with check (user_id = auth.uid());
create policy "read own tickets" on public.support_tickets for select to authenticated using (user_id = auth.uid());

create index if not exists support_tickets_new on public.support_tickets (status, created_at desc);
