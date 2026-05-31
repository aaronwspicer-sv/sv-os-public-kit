-- ============================================================
-- Spicer OS — Supabase Schema
-- Run this in your Supabase SQL editor after creating the project
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ── Daily Todos (Goals page) ─────────────────────────────────
create table if not exists public.daily_todos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  text        text not null,
  done        boolean not null default false,
  queued      boolean not null default false,
  done_at     timestamptz,
  date        date not null,               -- which day this todo belongs to
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index daily_todos_user_date on public.daily_todos(user_id, date);

alter table public.daily_todos enable row level security;

create policy "Users can only access their own todos"
  on public.daily_todos for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Plaid Items (linked bank accounts) ──────────────────────
create table if not exists public.plaid_items (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  access_token_enc    text not null,       -- AES-256 encrypted, never plaintext
  item_id             text not null unique,
  institution_name    text,
  institution_id      text,
  created_at          timestamptz not null default now(),
  last_synced_at      timestamptz
);

alter table public.plaid_items enable row level security;

create policy "Users can only access their own Plaid items"
  on public.plaid_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Plaid Transactions Inbox ─────────────────────────────────
create table if not exists public.plaid_transactions_inbox (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  plaid_transaction_id text not null unique,
  merchant_name        text,
  amount               numeric(10,2) not null,
  date                 date not null,
  suggested_category   text,
  account_id           text,
  confirmed            boolean not null default false,
  confirmed_at         timestamptz,
  notion_page_id       text,              -- set after confirmed → Notion entry created
  created_at           timestamptz not null default now()
);

create index plaid_inbox_user_confirmed on public.plaid_transactions_inbox(user_id, confirmed);

alter table public.plaid_transactions_inbox enable row level security;

create policy "Users can only access their own inbox"
  on public.plaid_transactions_inbox for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── PIN Auth ─────────────────────────────────────────────────
create table if not exists public.user_pins (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  pin_hash      text not null,            -- bcrypt hash, never plaintext
  attempts      int not null default 0,
  locked_until  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.user_pins enable row level security;

create policy "Users can only access their own PIN record"
  on public.user_pins for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── TOTP 2FA ─────────────────────────────────────────────────
create table if not exists public.user_totp (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  secret_enc    text not null,            -- AES-256 encrypted TOTP secret
  enabled       boolean not null default false,
  backup_codes  text[],                   -- hashed backup codes
  created_at    timestamptz not null default now()
);

alter table public.user_totp enable row level security;

create policy "Users can only access their own TOTP record"
  on public.user_totp for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Audit Log ────────────────────────────────────────────────
create table if not exists public.audit_log (
  id          bigserial primary key,
  user_id     uuid references auth.users(id) on delete set null,
  action      text not null,              -- e.g. 'login', 'pin_attempt', 'plaid_confirm'
  ip          text,
  user_agent  text,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

create index audit_log_user on public.audit_log(user_id, created_at desc);
create index audit_log_action on public.audit_log(action, created_at desc);

alter table public.audit_log enable row level security;

-- Allow inserts for both user-scoped events and system events (null user_id,
-- e.g. intrusion attempts where the offending user isn't in our allowlist).
create policy "Users can insert audit entries"
  on public.audit_log for insert
  with check (auth.uid() = user_id OR user_id IS NULL);

-- Allow reads of own entries + system (null user_id) entries so the
-- Settings audit viewer works without service-role access.
create policy "Users can read audit entries"
  on public.audit_log for select
  using (auth.uid() = user_id OR user_id IS NULL);

-- ── Known Devices ────────────────────────────────────────────
create table if not exists public.known_devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  device_hash  text not null,             -- hash of user-agent + IP
  approved     boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique(user_id, device_hash)
);

alter table public.known_devices enable row level security;

create policy "Users can manage their own known devices"
  on public.known_devices for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Manual Assets ────────────────────────────────────────────
create table if not exists public.manual_assets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category    text not null,               -- crypto | stocks | real_estate | vehicle | other
  name        text not null,
  amount_cad  numeric(14,2) not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index manual_assets_user on public.manual_assets(user_id);

alter table public.manual_assets enable row level security;

create policy "Users can only access their own manual assets"
  on public.manual_assets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Wishlist ──────────────────────────────────────────────────
create table if not exists public.wishlist (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  amount_cad  numeric(14,2) not null,
  created_at  timestamptz not null default now()
);

create index wishlist_user on public.wishlist(user_id);

alter table public.wishlist enable row level security;

create policy "Users can only access their own wishlist"
  on public.wishlist for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Updated-at trigger ───────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_daily_todos_updated_at
  before update on public.daily_todos
  for each row execute function public.set_updated_at();

create trigger set_user_pins_updated_at
  before update on public.user_pins
  for each row execute function public.set_updated_at();

create trigger set_manual_assets_updated_at
  before update on public.manual_assets
  for each row execute function public.set_updated_at();

-- ── Plaid → Notion Account Mapping ────────────────────────────
-- Links each Plaid account ID to its corresponding Notion Accounts DB page,
-- so the transaction confirm flow can auto-default the "From Account" relation
-- and we don't double-count Plaid (live) vs Notion (record) balances.
create table if not exists public.plaid_notion_account_map (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  plaid_account_id  text not null,
  notion_page_id    text not null,
  created_at        timestamptz not null default now(),
  unique(user_id, plaid_account_id)
);

create index plaid_notion_map_user on public.plaid_notion_account_map(user_id);

alter table public.plaid_notion_account_map enable row level security;

create policy "Users can manage their own account mappings"
  on public.plaid_notion_account_map for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Push Subscriptions ────────────────────────────────────────
-- Stores Web Push subscriptions per (user, device). One row per device.
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now(),
  unique(user_id, endpoint)
);

create index push_subscriptions_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

create policy "Users can manage their own push subscriptions"
  on public.push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Idea Inbox ────────────────────────────────────────────────
-- Raw ideas captured fast — not yet promoted into the SV Videos
-- Notion pipeline. Promote with a single click which creates a
-- Notion entry and marks this row as promoted.
create table if not exists public.idea_inbox (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  text          text not null,
  source        text,                              -- "cmdk" | "inbox" | "voice" | "shortcut"
  promoted      boolean not null default false,
  promoted_at   timestamptz,
  notion_page_id text,                             -- set after promotion
  created_at    timestamptz not null default now()
);

create index idea_inbox_user_created on public.idea_inbox(user_id, created_at desc);
create index idea_inbox_user_promoted on public.idea_inbox(user_id, promoted);

alter table public.idea_inbox enable row level security;

create policy "Users can manage their own ideas"
  on public.idea_inbox for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Timeline Photos ───────────────────────────────────────────
-- Photos sourced from iCloud via iOS/macOS Shortcut. Each row is
-- one photo with extracted EXIF metadata. Thumbnail stored inline
-- as base64 data URL (kept small — 200px) to avoid blob storage
-- complexity. Full-res URL optional (e.g. iCloud public share link).
create table if not exists public.timeline_photos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  taken_at      timestamptz not null,
  caption       text,
  place_name    text,
  latitude      double precision,
  longitude     double precision,
  image_url     text,
  thumbnail     text,                                  -- base64 data URL or external
  source        text default 'shortcut',
  external_id   text,                                  -- iCloud asset id for dedup
  created_at    timestamptz not null default now(),
  unique(user_id, external_id)
);

create index timeline_photos_user_taken on public.timeline_photos(user_id, taken_at desc);

alter table public.timeline_photos enable row level security;

create policy "Users can manage their own photos"
  on public.timeline_photos for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Public Profiles (RPG character sheets) ────────────────────
-- Customizable bits of a user's public-facing profile. The page itself
-- pulls aggregate stats from existing data via a service-role function
-- that returns ONLY whitelisted fields — no money, no journal text,
-- no API keys leak.
create table if not exists public.public_profiles (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  slug              text unique not null,
  display_name      text,
  title             text,
  tagline           text,
  location          text,
  avatar_url        text,
  bio               text,
  skills            jsonb default '[]'::jsonb,
  show_streaks      boolean not null default true,
  show_achievements boolean not null default true,
  show_quests       boolean not null default true,
  show_battle_log   boolean not null default true,
  show_skills       boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index public_profiles_slug on public.public_profiles(slug);

alter table public.public_profiles enable row level security;

-- Owner manages own profile
create policy "Users manage own public profile"
  on public.public_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Anyone can read (the page is public). We only store curated, public-safe
-- fields here — never sensitive data.
create policy "Anyone can read public profiles"
  on public.public_profiles for select
  using (true);

-- ─────────────────────────────────────────────────────────────
-- Passkeys / WebAuthn
-- One row per registered device. credential_id is the public, unique handle
-- returned by the authenticator. public_key is base64-encoded COSE.
-- counter prevents credential cloning (regressions = revoke + alert).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.user_passkeys (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  credential_id     text unique not null,
  public_key        text not null,
  counter           bigint not null default 0,
  transports        text[],
  device_label      text,
  backed_up         boolean not null default false,
  created_at        timestamptz not null default now(),
  last_used_at      timestamptz
);
create index if not exists user_passkeys_user_id on public.user_passkeys(user_id);
alter table public.user_passkeys enable row level security;
create policy "Users manage own passkeys"
  on public.user_passkeys for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.webauthn_challenges (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  challenge         text not null,
  purpose           text not null check (purpose in ('register','auth','vault')),
  created_at        timestamptz not null default now()
);
create index if not exists webauthn_challenges_user_id on public.webauthn_challenges(user_id);
alter table public.webauthn_challenges enable row level security;
create policy "Users manage own challenges"
  on public.webauthn_challenges for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Per-device session tracking (active sessions + remote sign-out)
-- One row per (user, device_id). The device_id comes from an HMAC-signed
-- HTTP-only cookie set on first ping. Revoking a row makes that browser
-- get bounced to /login on its next 2-min ping.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.user_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  device_id       text not null,
  device_label    text,
  user_agent      text,
  ip              text,
  city            text,
  region          text,
  country         text,
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  revoked_at      timestamptz,
  unique(user_id, device_id)
);
create index if not exists user_sessions_user_id on public.user_sessions(user_id);
create index if not exists user_sessions_last_seen on public.user_sessions(last_seen_at desc);
alter table public.user_sessions enable row level security;
create policy "Users manage own sessions"
  on public.user_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Tamper-evident audit log (hash chain)
-- BEFORE INSERT trigger computes:
--   chain_seq = prev seq + 1
--   prev_hash = last row_hash for this user
--   row_hash  = HMAC-SHA256(secret, prev_hash || user_id || action || metadata || chain_seq)
-- Secret lives in Supabase Vault (vault.secrets where name='audit_chain_secret').
-- Verifier: select * from audit_log_verify_chain(<user_id>).
-- ─────────────────────────────────────────────────────────────
alter table public.audit_log add column if not exists prev_hash text;
alter table public.audit_log add column if not exists row_hash  text;
alter table public.audit_log add column if not exists chain_seq bigint;
create unique index if not exists audit_log_user_chain_seq on public.audit_log(user_id, chain_seq);
-- Trigger function + audit_log_verify_chain() function defined via migration
-- (audit_log_hash_chain + audit_log_verify_chain_fn). The secret is generated
-- once and stored in vault.secrets — don't commit it here.

-- ─────────────────────────────────────────────────────────────
-- Alfred — SV-GPT skill + conversations
-- sv_gpt_skill: versioned identity document (active = highest version)
-- alfred_conversations / alfred_messages: chat history per-user
-- ─────────────────────────────────────────────────────────────
create table if not exists public.sv_gpt_skill (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null default 1,
  content text not null,
  edited_by text,
  created_at timestamptz not null default now(),
  unique(user_id, version)
);
alter table public.sv_gpt_skill enable row level security;
create policy "Users manage own skill" on public.sv_gpt_skill for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.alfred_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.alfred_conversations enable row level security;
create policy "Users manage own conversations" on public.alfred_conversations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.alfred_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.alfred_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool','system')),
  content text,
  tool_calls jsonb,
  tool_call_id text,
  tool_name text,
  created_at timestamptz not null default now()
);
alter table public.alfred_messages enable row level security;
create policy "Users manage own messages" on public.alfred_messages for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Alfred's saved notes (the `save_note` / `list_notes` tools)
-- Short facts Alfred captures so he can recall them next session.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.alfred_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  content     text not null,
  tag         text,
  created_at  timestamptz not null default now()
);
alter table public.alfred_notes enable row level security;
create policy "Users manage own notes" on public.alfred_notes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Alfred T7 — Long-term memory (pgvector)
-- Every memory is content + 1536-dim embedding (text-embedding-3-small).
-- Recall via cosine similarity (HNSW index). Two write paths:
--   1. explicit  — the `remember` tool (Aaron says save this)
--   2. auto      — maybeSummarizeTurn extracts durable facts after each turn
-- RPC alfred_recall_memories(user_id, embedding, limit) handles vector search.
-- RPC alfred_bump_recall(ids[]) tracks usage for "which memories matter."
-- ─────────────────────────────────────────────────────────────
create extension if not exists vector with schema extensions;

create table if not exists public.alfred_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('explicit','conversation_summary','pattern','fact')),
  content text not null,
  embedding extensions.vector(1536),
  importance smallint not null default 5 check (importance between 1 and 10),
  source_conversation_id uuid references public.alfred_conversations(id) on delete set null,
  tag text,
  created_at timestamptz not null default now(),
  last_recalled_at timestamptz,
  recall_count integer not null default 0
);
alter table public.alfred_memories enable row level security;
create policy "Users manage own memories" on public.alfred_memories for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- HNSW index for fast cosine similarity at scale
create index if not exists alfred_memories_embedding
  on public.alfred_memories using hnsw (embedding extensions.vector_cosine_ops);

-- ─────────────────────────────────────────────────────────────
-- SV Content Pipeline videos (T3) — Alfred's 7-stage state.
-- Mirrors ~/Library/.../SpicerVisions/Pipeline/videos/[slug]/* but in DB
-- so Alfred works from anywhere. Notion SV Videos DB stays as shared
-- source of truth between OS + Claude Code on laptop.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.pipeline_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null,
  working_title text,
  final_title text,
  type text check (type in ('Long Form', 'Standalone Short', 'Short Form Clip')),
  content_pillar text check (content_pillar in ('Process', 'Proof', 'Journey', 'Lessons')),
  status text not null default 'Idea' check (status in ('Idea','Packaged','Scripted','Filmed','Editing','Live')),
  current_stage smallint not null default 1 check (current_stage between 1 and 7),
  notion_page_id text,
  notion_url text,
  stages jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, slug)
);
alter table public.pipeline_videos enable row level security;
create policy "Users manage own pipeline videos" on public.pipeline_videos for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Calendar feeds for Alfred — secret iCal URLs per user.
-- URLs encrypted at rest with ENCRYPTION_KEY scheme (same as plaid_items).
-- Server fetches + parses ICS; events power get_today_calendar tool +
-- the live OS snapshot.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.user_calendars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  ical_url_enc text not null,
  color text,
  created_at timestamptz not null default now()
);
alter table public.user_calendars enable row level security;
create policy "Users manage own calendars" on public.user_calendars for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Alfred panic kill switch — flip alfred_disabled=true and every
-- Alfred endpoint returns 503 immediately. Doesn't affect anything
-- else in the OS. Toggle from Settings → "Alfred kill switch".
-- ─────────────────────────────────────────────────────────────
create table if not exists public.alfred_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  alfred_disabled boolean not null default false,
  disabled_reason text,
  disabled_at timestamptz,
  -- First-login wizard: set when the user finishes onboarding (even by
  -- skipping). Null = show the wizard. onboarding_tier records which depth
  -- they chose (quick|full|power) so Settings can offer "complete a higher tier".
  onboarded_at timestamptz,
  onboarding_tier text,
  updated_at timestamptz not null default now()
);
-- Backfill columns on existing deployments
alter table public.alfred_settings add column if not exists onboarded_at timestamptz;
alter table public.alfred_settings add column if not exists onboarding_tier text;
alter table public.alfred_settings enable row level security;
create policy "Users manage own alfred settings" on public.alfred_settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Flinks (Plaid replacement) — Canadian open-banking aggregator.
-- LoginId encrypted with ENCRYPTION_KEY scheme. Vault-gated everywhere.
-- Tables mirror plaid_* 1:1 for easy Alfred re-pointing.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.flinks_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  login_id_enc text not null,
  institution text,
  last_refresh_at timestamptz,
  status text not null default 'active' check (status in ('active','needs_reauth','disabled','error')),
  error_code text,
  created_at timestamptz not null default now()
);
alter table public.flinks_items enable row level security;
create policy "Users manage own flinks items" on public.flinks_items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.flinks_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.flinks_items(id) on delete cascade,
  flinks_account_id text not null,
  name text, institution text, type text, subtype text, category text,
  currency text default 'CAD',
  balance numeric, available_balance numeric, mask text,
  updated_at timestamptz not null default now(),
  unique(user_id, flinks_account_id)
);
alter table public.flinks_accounts enable row level security;
create policy "Users manage own flinks accounts" on public.flinks_accounts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.flinks_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.flinks_accounts(id) on delete cascade,
  flinks_tx_id text not null,
  date date not null,
  description text, merchant_name text,
  amount numeric not null, currency text default 'CAD',
  category text, suggested_category text,
  notion_page_id text, confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, flinks_tx_id)
);
alter table public.flinks_transactions enable row level security;
create policy "Users manage own flinks transactions" on public.flinks_transactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Plaid is gone (Commit 4 of Flinks migration).
-- The following tables were dropped:
--   plaid_items, plaid_accounts, plaid_transactions,
--   plaid_transactions_inbox, plaid_account_mappings
-- All finance integration now goes through flinks_* tables above.
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- bank_* (SaltEdge, post-Flinks-pivot — Flinks turned out enterprise-only).
-- Aggregator-agnostic schema so any future provider swap = code-only.
-- All routes vault-gated. secret_enc holds connection secret encrypted with
-- the FINANCE key (separate from main, matches prior posture).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.bank_customer (
  user_id uuid primary key references auth.users(id) on delete cascade,
  saltedge_customer_id text not null,
  created_at timestamptz not null default now()
);
alter table public.bank_customer enable row level security;
create policy "Users manage own bank customer" on public.bank_customer for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.bank_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'saltedge',
  provider_connection_id text not null,
  secret_enc text,
  institution text,
  status text not null default 'active' check (status in ('active','needs_reauth','disabled','error')),
  error_code text,
  last_refresh_at timestamptz, next_refresh_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, provider_connection_id)
);
alter table public.bank_items enable row level security;
create policy "Users manage own bank items" on public.bank_items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.bank_items(id) on delete cascade,
  provider_account_id text not null,
  name text, institution text, type text, category text,
  currency text default 'CAD',
  balance numeric, available_balance numeric, mask text,
  updated_at timestamptz not null default now(),
  unique(user_id, provider_account_id)
);
alter table public.bank_accounts enable row level security;
create policy "Users manage own bank accounts" on public.bank_accounts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.bank_accounts(id) on delete cascade,
  provider_tx_id text not null,
  date date not null,
  description text, merchant_name text,
  amount numeric not null, currency text default 'CAD',
  category text, suggested_category text,
  notion_page_id text, confirmed_at timestamptz,
  -- Alfred auto-categorize: tracks the last sweep + LLM confidence so the
  -- next sweep skips rows Alfred already decided on (loop termination).
  alfred_reviewed_at timestamptz,
  alfred_confidence text check (alfred_confidence in ('high','low')),
  created_at timestamptz not null default now(),
  unique(user_id, provider_tx_id)
);
-- Backfill columns on existing deployments
alter table public.bank_transactions add column if not exists alfred_reviewed_at timestamptz;
alter table public.bank_transactions add column if not exists alfred_confidence text;
alter table public.bank_transactions enable row level security;
create policy "Users manage own bank transactions" on public.bank_transactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Cron run log — every scheduled job records here on completion.
-- The /api/health/cron endpoint reads this to surface "is the cron
-- still alive" status. Morning brief also checks here for stale jobs
-- (>36h since last success) and pushes a notification if any are dead.
-- Written by service-role only (no RLS rows for users to insert; the
-- service role bypasses RLS). Owner reads via service role.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.cron_runs (
  id bigserial primary key,
  job_name text not null,
  status text not null check (status in ('success','failure','partial')),
  duration_ms int,
  error text,
  metadata jsonb,
  ran_at timestamptz not null default now()
);
create index if not exists cron_runs_job_ran on public.cron_runs(job_name, ran_at desc);
alter table public.cron_runs enable row level security;
-- No user policy — only service-role writes/reads (crons run with
-- SUPABASE_SERVICE_ROLE_KEY which bypasses RLS).

-- ── Log drafts ───────────────────────────────────────────────
-- Cross-device autosave for the daily log (saved on every keystroke,
-- debounced; Notion is only written when you hit "Save to Notion").
create table if not exists public.log_drafts (
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  entry      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);
alter table public.log_drafts enable row level security;
create policy "Users manage own log drafts" on public.log_drafts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Database functions (RPCs) the app calls. REQUIRED — without these,
-- Alfred's long-term memory recall and the audit-integrity check break.
-- ─────────────────────────────────────────────────────────────

-- Alfred memory: semantic vector recall (cosine similarity over embeddings).
create or replace function public.alfred_recall_memories(
  p_user_id uuid,
  p_query_embedding extensions.vector,
  p_limit integer default 6,
  p_min_similarity real default 0.30
)
returns table(id uuid, kind text, content text, importance smallint, tag text, created_at timestamptz, similarity real)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  return query
  select
    m.id, m.kind, m.content, m.importance, m.tag, m.created_at,
    (1 - (m.embedding <=> p_query_embedding))::real as similarity
  from public.alfred_memories m
  where m.user_id = p_user_id
    and m.embedding is not null
    and (1 - (m.embedding <=> p_query_embedding)) > p_min_similarity
  order by m.embedding <=> p_query_embedding asc
  limit p_limit;
end;
$$;

-- Alfred memory: bump recall stats when memories are surfaced.
create or replace function public.alfred_bump_recall(p_ids uuid[])
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.alfred_memories
    set recall_count = recall_count + 1,
        last_recalled_at = now()
    where id = any(p_ids);
$$;

-- Audit-integrity verification. Returns a "not configured" row unless you've
-- set up the optional tamper-evident chain (a Vault secret named
-- 'audit_chain_secret' + an insert trigger that fills prev_hash/row_hash/
-- chain_seq). Basic audit logging works without any of that; this only
-- powers the Settings → "Verify integrity" button.
create or replace function public.audit_log_verify_chain(p_user_id uuid)
returns table(checked bigint, broken_at_seq bigint, broken_at_id uuid, reason text)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'vault'
as $$
declare
  r record;
  v_prev text := null;
  v_secret text;
  v_canonical text;
  v_expected text;
  v_expected_seq bigint := 0;
  v_count bigint := 0;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'audit_chain_secret' limit 1;
  if v_secret is null then
    return query select 0::bigint, null::bigint, null::uuid, 'audit_chain_secret not found'::text;
    return;
  end if;

  for r in (
    select id, user_id, action, metadata, prev_hash, row_hash, chain_seq
    from public.audit_log
    where user_id = p_user_id
    order by chain_seq asc nulls last, created_at asc, id asc
  ) loop
    v_count := v_count + 1;
    v_expected_seq := v_expected_seq + 1;
    if r.chain_seq is null or r.chain_seq <> v_expected_seq then
      return query select v_count, r.chain_seq, r.id, 'chain_seq mismatch'::text; return;
    end if;
    if coalesce(r.prev_hash, '') <> coalesce(v_prev, '') then
      return query select v_count, r.chain_seq, r.id, 'prev_hash mismatch'::text; return;
    end if;
    v_canonical := coalesce(v_prev, '') || '|' || r.user_id::text || '|' || coalesce(r.action, '')
                || '|' || coalesce(r.metadata::text, '') || '|' || r.chain_seq::text;
    v_expected := encode(extensions.hmac(v_canonical, v_secret, 'sha256'), 'hex');
    if r.row_hash is null or r.row_hash <> v_expected then
      return query select v_count, r.chain_seq, r.id, 'row_hash mismatch'::text; return;
    end if;
    v_prev := r.row_hash;
  end loop;

  return query select v_count, null::bigint, null::uuid, null::text;
end;
$$;
