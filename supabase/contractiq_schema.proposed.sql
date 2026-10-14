-- ContractIQ Supabase schema proposal — REVIEW AND APPLY MANUALLY ONLY.
-- This file is never run automatically by the app or build.
-- Inspect the project's existing schemas/policies before applying. All object
-- names are ContractIQ-prefixed to avoid taking over generic public tables.
--
-- Account submissions go through the authenticated Python API. The API uses a
-- server-only service-role credential to create queued scans; the private queue
-- worker runs the isolated analyzer and persists trusted findings and outcomes.
-- Browser roles have read-only access to their own rows and cannot enqueue or
-- delete scans directly.

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
  constraint contractiq_scans_source_size check (octet_length(source_code) between 1 and 500000),
  constraint contractiq_scans_id_user_unique unique (id, user_id)
);

-- Keep upgrades of a previously-created table aligned with the API's UTF-8
-- byte limit instead of leaving the older character-count constraint active.
alter table public.contractiq_scans
  drop constraint if exists contractiq_scans_source_size;
alter table public.contractiq_scans
  add constraint contractiq_scans_source_size check (octet_length(source_code) between 1 and 500000);

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
create index if not exists contractiq_scans_queued_created_idx
  on public.contractiq_scans (created_at asc, id asc)
  where status = 'queued';
create index if not exists contractiq_findings_scan_severity_idx
  on public.contractiq_findings (scan_id, severity);
create index if not exists contractiq_findings_scan_owner_created_idx
  on public.contractiq_findings (scan_id, user_id, created_at asc, id asc);
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
drop policy if exists contractiq_scans_delete_own on public.contractiq_scans;

drop policy if exists contractiq_findings_select_own on public.contractiq_findings;
create policy contractiq_findings_select_own on public.contractiq_findings
for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.contractiq_profiles, public.contractiq_scans, public.contractiq_findings from anon, authenticated, service_role;
grant select on public.contractiq_profiles to authenticated;
grant update (display_name) on public.contractiq_profiles to authenticated;
grant select on public.contractiq_scans to authenticated;
grant select on public.contractiq_findings to authenticated;

-- Make the server-side PostgREST contract explicit. This also works in
-- projects where new public tables are not automatically exposed to roles.
grant select, insert, update on public.contractiq_scans to service_role;
grant select, insert, delete on public.contractiq_findings to service_role;

comment on table public.contractiq_scans is
  'Authenticated source submissions. Browser clients can read their own rows; only the authenticated Python API and trusted backend worker write scan records and outcomes.';
comment on table public.contractiq_findings is
  'Trusted analyzer output. Browser clients can read only their own findings and cannot create, alter, or delete findings.';
