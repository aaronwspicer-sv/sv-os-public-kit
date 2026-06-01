-- Time tracking: log blocks of work time to named projects
create table if not exists time_blocks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  date        date not null default current_date,
  project     text not null,
  duration_m  integer not null check (duration_m > 0),
  notes       text,
  created_at  timestamptz default now()
);

alter table time_blocks enable row level security;

create policy "owner only" on time_blocks
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists time_blocks_user_date on time_blocks(user_id, date desc);
