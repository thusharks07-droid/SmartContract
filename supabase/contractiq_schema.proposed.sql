-- ContractIQ Supabase schema proposal — REVIEW AND APPLY MANUALLY ONLY.
-- This file is never run automatically by the app or build.
-- Inspect the project's existing schemas/policies before applying. All object
-- names are ContractIQ-prefixed to avoid taking over generic public tables.
--
-- Supabase Auth/Postgres does not analyze Solidity. Client submissions remain
-- queued. Only a separately provisioned trusted analyzer may set outcomes or
-- insert findings. No scanner endpoint is configured by this repository.

create schema if not exists contractiq_private;
revoke all on schema contractiq_private from public, anon, authenticated;

create table if not exists public.contractiq_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.contractiq_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contract_name text not null default 'Untitled Contract',
  source_filename text,
  source_code text not null,
  source_hash text,
  input_type text not null check (input_type in ('upload', 'paste')),
  compiler_version text,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  is_demo boolean not null default false check (is_demo = false),
  analysis_engine text,
  analysis_version text,
  options jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint contractiq_scans_source_size check (char_length(source_code) between 1 and 500000),
  constraint contractiq_scans_id_user_unique unique (id, user_id)
);

create table if not exists public.contractiq_findings (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_id text not null,
  title text not null,
  description text not null default '',
  impact text not null default '',
  severity text not null check (severity in ('critical', 'high', 'medium', 'low', 'informational')),
  confidence text check (confidence in ('high', 'medium', 'low')),
  category text,
  source_path text,
  line_start integer check (line_start is null or line_start > 0),
  line_end integer check (line_end is null or line_end > 0),
  code_excerpt text,
  recommendation text not null default '',
  evidence jsonb not null default '[]'::jsonb,
  verification jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  constraint contractiq_findings_scan_owner_fk foreign key (scan_id, user_id)
    references public.contractiq_scans(id, user_id) on delete cascade
);

create index if not exists contractiq_scans_user_created_idx
  on public.contractiq_scans (user_id, created_at desc);
create index if not exists contractiq_scans_user_status_idx
  on public.contractiq_scans (user_id, status);
create index if not exists contractiq_findings_scan_severity_idx
  on public.contractiq_findings (scan_id, severity);
create index if not exists contractiq_findings_user_created_idx
  on public.contractiq_findings (user_id, created_at desc);

create or replace function contractiq_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;
revoke all on function contractiq_private.set_updated_at() from public, anon, authenticated;

create or replace function contractiq_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.contractiq_profiles (user_id, display_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function contractiq_private.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists contractiq_profiles_set_updated_at on public.contractiq_profiles;
create trigger contractiq_profiles_set_updated_at
before update on public.contractiq_profiles
for each row execute function contractiq_private.set_updated_at();

drop trigger if exists contractiq_auth_user_created on auth.users;
create trigger contractiq_auth_user_created
after insert on auth.users
for each row execute function contractiq_private.handle_new_auth_user();

alter table public.contractiq_profiles enable row level security;
alter table public.contractiq_scans enable row level security;
alter table public.contractiq_findings enable row level security;

drop policy if exists contractiq_profiles_select_own on public.contractiq_profiles;
create policy contractiq_profiles_select_own on public.contractiq_profiles
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists contractiq_profiles_update_own on public.contractiq_profiles;
create policy contractiq_profiles_update_own on public.contractiq_profiles
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists contractiq_scans_select_own on public.contractiq_scans;
create policy contractiq_scans_select_own on public.contractiq_scans
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists contractiq_scans_insert_queued_own on public.contractiq_scans;
create policy contractiq_scans_insert_queued_own on public.contractiq_scans
for insert to authenticated with check (
  (select auth.uid()) = user_id
  and status = 'queued'
  and is_demo = false
  and analysis_engine is null
  and analysis_version is null
  and error_code is null
  and error_message is null
  and started_at is null
  and completed_at is null
  and summary = '{}'::jsonb
);

drop policy if exists contractiq_scans_delete_own on public.contractiq_scans;
create policy contractiq_scans_delete_own on public.contractiq_scans
for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists contractiq_findings_select_own on public.contractiq_findings;
create policy contractiq_findings_select_own on public.contractiq_findings
for select to authenticated using ((select auth.uid()) = user_id);

-- Column-level insert grants prevent browser clients from setting analyzer-owned
-- status/result fields even before RLS checks. No UPDATE grant is given on scans.
revoke all on public.contractiq_profiles, public.contractiq_scans, public.contractiq_findings from anon, authenticated;
grant select on public.contractiq_profiles to authenticated;
grant update (display_name) on public.contractiq_profiles to authenticated;
grant select, delete on public.contractiq_scans to authenticated;
grant insert (user_id, contract_name, source_filename, source_code, source_hash,
  input_type, compiler_version, options, notes) on public.contractiq_scans to authenticated;
grant select on public.contractiq_findings to authenticated;

comment on table public.contractiq_scans is
  'Authenticated source submissions. Browser clients can only insert queued non-demo submissions. No scanner is configured by ContractIQ frontend.';
comment on table public.contractiq_findings is
  'Trusted analyzer output. Browser clients can read only their own findings and cannot create or alter findings.';
