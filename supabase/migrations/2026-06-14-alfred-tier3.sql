-- Tier 3 Alfred settings: voice passphrase + camera wake toggle
alter table public.alfred_settings
  add column if not exists voice_passphrase      text,
  add column if not exists camera_wake_enabled   boolean not null default false;
