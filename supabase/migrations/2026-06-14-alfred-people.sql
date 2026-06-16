-- Alfred's people directory: everyone Aaron has introduced Alfred to.
-- Alfred remembers them across sessions, knows their relationship to Aaron,
-- and respects their trust level (trusted vs guest-only, data access or not).

create table if not exists public.alfred_people (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  name          text        not null,
  relationship  text        not null,   -- "best friend", "mom", "editor", "girlfriend", etc.
  context       text        not null default '',  -- what Alfred should know about them
  trust_level   text        not null default 'trusted'
                            check (trust_level in ('trusted', 'guest_only')),
  can_query_data boolean    not null default false,  -- can they ask about Aaron's stats/data?
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.alfred_people enable row level security;

create policy "owner only" on public.alfred_people
  for all using (auth.uid() = user_id);

create index alfred_people_user_idx on public.alfred_people(user_id);
