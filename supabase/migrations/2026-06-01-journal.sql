-- Full journal: rich text entries with tags, mood, and search
create table if not exists journal_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  date        date not null default current_date,
  title       text,
  body        text not null default '',
  mood        smallint check (mood between 1 and 5),
  tags        text[] default '{}',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (user_id, date)
);

alter table journal_entries enable row level security;

create policy "owner only" on journal_entries
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists journal_entries_user_date on journal_entries(user_id, date desc);

-- Full-text search index
create index if not exists journal_entries_fts on journal_entries
  using gin(to_tsvector('english', coalesce(title,'') || ' ' || body));
