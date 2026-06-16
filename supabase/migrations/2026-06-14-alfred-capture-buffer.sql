-- Phase 2 of Autonomous Alfred — the self-documenting engine.
-- alfred_capture_buffer holds raw, fresh build material the instant it happens
-- (a git commit, a published video) so the evening self-doc pass drafts content
-- from rich context instead of reconstructing the day from memory. Capture is
-- cheap (a hook POSTs here, no agent wake); the pass consumes it later.
create table if not exists public.alfred_capture_buffer (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('commit','video','note')),
  title      text,
  body       text,
  meta       jsonb,
  consumed   boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists alfred_capture_unconsumed
  on public.alfred_capture_buffer(user_id, consumed, created_at desc);
alter table public.alfred_capture_buffer enable row level security;
create policy "Users manage own capture buffer" on public.alfred_capture_buffer for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
