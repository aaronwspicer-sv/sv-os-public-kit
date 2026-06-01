-- Smarter memory categories: widen alfred_memories.kind to include the new
-- semantic kinds (decision/preference/commitment/to-revisit). The feature
-- code writes these, but the original CHECK only allowed 4 values, so those
-- inserts were failing. Widening a CHECK is safe — all existing rows use the
-- original 4 kinds, which remain valid.
alter table public.alfred_memories
  drop constraint if exists alfred_memories_kind_check;

alter table public.alfred_memories
  add constraint alfred_memories_kind_check
  check (kind in ('explicit','conversation_summary','pattern','fact','decision','preference','commitment','to-revisit'));
