-- Net worth history snapshots
-- One row per day (upsert on date). Records the calculated net worth so we can
-- plot a time-series chart over months/years.
create table if not exists net_worth_snapshots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,
  amount_cad  numeric(14, 2) not null,
  breakdown   jsonb default '{}'::jsonb, -- {banks, manual, other}
  created_at  timestamptz not null default now(),
  unique(user_id, snapshot_date)
);

alter table net_worth_snapshots enable row level security;

create policy "owner can read own snapshots"
  on net_worth_snapshots for select
  using (auth.uid() = user_id);

create policy "owner can upsert own snapshots"
  on net_worth_snapshots for insert
  with check (auth.uid() = user_id);

create policy "owner can update own snapshots"
  on net_worth_snapshots for update
  using (auth.uid() = user_id);

create index if not exists net_worth_snapshots_user_date_idx
  on net_worth_snapshots(user_id, snapshot_date desc);
