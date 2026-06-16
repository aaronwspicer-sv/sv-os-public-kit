-- Phase 0 of Autonomous Alfred — "the cage". Lays the safety primitives BEFORE
-- Alfred gains any autonomous power:
--   • alfred_settings.autonomy_enabled — master opt-in for autonomous action.
--     Defaults FALSE. Chat/voice Alfred works regardless; this only governs the
--     (not-yet-built) autonomous loop. Distinct from alfred_disabled, which is
--     the panic switch that silences Alfred entirely.
--   • alfred_actions — the action ledger. Every state-changing tool call Alfred
--     makes (chat, voice, or later autonomous) writes a tier-classified row here.
--     This is the source for the "what Alfred did" activity feed, and the home
--     for undo tokens + proposal/approval rows in later phases.

alter table public.alfred_settings
  add column if not exists autonomy_enabled boolean not null default false;

create table if not exists public.alfred_actions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- green = internal + reversible · amber = sensitive/hard-to-reverse · red = outbound/irreversible
  tier          text not null check (tier in ('green','amber','red')),
  boundary      text not null default 'internal' check (boundary in ('internal','outbound')),
  tool          text not null,
  summary       text,                                  -- human-readable "what happened"
  justification text,                                  -- why (populated for autonomous actions)
  tainted       boolean not null default false,        -- did untrusted input justify this?
  taint_sources text[],                                -- which untrusted inputs touched it
  origin        text not null default 'chat'
                  check (origin in ('chat','voice','autonomous','exec')),
  status        text not null default 'done'
                  check (status in ('proposed','done','failed','denied','reversed')),
  reversible    boolean not null default false,
  undo_token    text,                                  -- opaque handle a future undo handler resolves
  reversed      boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists alfred_actions_user_created
  on public.alfred_actions(user_id, created_at desc);

alter table public.alfred_actions enable row level security;
create policy "Users manage own alfred actions" on public.alfred_actions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
