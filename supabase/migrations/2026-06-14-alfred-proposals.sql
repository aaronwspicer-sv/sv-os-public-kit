-- Phase 4 of Autonomous Alfred — the red gate. Outbound/irreversible actions are
-- never executed autonomously; they're recorded as status='proposed' and wait
-- for one-tap human approval. `payload` stores the exact tool args to run if (and
-- only if) the owner approves.
alter table public.alfred_actions
  add column if not exists payload jsonb;
