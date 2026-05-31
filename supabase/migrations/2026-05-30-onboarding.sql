-- First-login wizard state. Run in Supabase SQL Editor.
-- Adds onboarding tracking to the existing alfred_settings table (no new table).
alter table public.alfred_settings add column if not exists onboarded_at  timestamptz;
alter table public.alfred_settings add column if not exists onboarding_tier text;
