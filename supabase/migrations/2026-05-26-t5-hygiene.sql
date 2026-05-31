-- T5 — Data hygiene migrations. Run in Supabase SQL Editor as one script.
-- These are not auto-applied; they're separate from supabase/schema.sql
-- so you can review each block before executing.
--
-- BEFORE RUNNING: take a Supabase snapshot (Project → Database → Backups
-- → "Create backup"). Some of these are non-reversible.

-- ─────────────────────────────────────────────────────────────
-- T5.1 — Drop dead Plaid tables
-- ─────────────────────────────────────────────────────────────
-- Plaid was replaced by Flinks (commit 4/4 of that migration) which was
-- then replaced by SaltEdge and finally by CSV import. The old Plaid
-- tables haven't been written to since the Flinks cutover in 2026-03.
-- All finance integration now goes through bank_* tables.
--
-- If you ever need to recover the data: it lives in your Supabase backup
-- before this runs. Otherwise, gone.

drop table if exists public.plaid_transactions_inbox cascade;
drop table if exists public.plaid_items              cascade;

-- ─────────────────────────────────────────────────────────────
-- T5.4 — Unique index on bank_transactions.notion_page_id
-- ─────────────────────────────────────────────────────────────
-- Prevents the same transaction from creating two Notion ledger rows
-- if confirmTransaction races (double-click on confirm button). The
-- current code does a defensive update to clear notion_page_id on
-- success, but the index makes it impossible to corrupt state.
--
-- Filtered to ignore NULLs so unconfirmed rows (which all have NULL
-- notion_page_id) don't conflict with each other.
create unique index if not exists bank_transactions_notion_unique
  on public.bank_transactions(notion_page_id)
  where notion_page_id is not null;

-- ─────────────────────────────────────────────────────────────
-- T5.2 supporting — audit_log_archive (older rows move here)
-- ─────────────────────────────────────────────────────────────
-- The audit_log_retention cron (added in this PR) moves rows older than
-- 90 days from audit_log → audit_log_archive once a day. Keeps the live
-- table fast; archive grows unbounded but is rarely queried.
-- Schema mirrors audit_log exactly.

create table if not exists public.audit_log_archive (
  id          bigint primary key,
  user_id     uuid references auth.users(id) on delete set null,
  action      text not null,
  ip          text,
  user_agent  text,
  metadata    jsonb,
  created_at  timestamptz not null,
  archived_at timestamptz not null default now()
);
create index if not exists audit_log_archive_user
  on public.audit_log_archive(user_id, created_at desc);
alter table public.audit_log_archive enable row level security;
create policy "Users read own archive"
  on public.audit_log_archive for select
  using (auth.uid() = user_id or user_id is null);
