-- Run these in Supabase SQL editor to create tables used by the app.

create table if not exists sites (
  id text primary key,
  owner_id uuid not null default auth.uid(),
  name text,
  location text,
  status text,
  workers_count integer default 0,
  created_at timestamptz default now()
);

create table if not exists employees (
  id text primary key,
  owner_id uuid not null default auth.uid(),
  name text not null,
  position text not null,
  status text,
  document_status text,
  email text,
  phone text,
  site_id text,
  created_at timestamptz default now()
);

create table if not exists attendance (
  id text primary key,
  owner_id uuid not null default auth.uid(),
  employee_id text,
  employee_name text,
  date date,
  status text,
  site_id text,
  created_at timestamptz default now(),
  clock_in timestamptz,
  clock_out timestamptz,
  notes text,
  hours numeric
);

create table if not exists payroll (
  id text primary key,
  owner_id uuid not null default auth.uid(),
  pay_period text,
  site_id text,
  employees_count integer,
  total_hours numeric,
  total numeric,
  status text,
  created_at timestamptz default now(),
  entries jsonb,
  data jsonb
);

-- MFA EMAIL SETUP CODES
create table if not exists mfa_setup_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  created_at timestamptz default now(),
  expires_at timestamptz not null,
  used boolean not null default false
);

-- If you enable RLS, add policies to allow your app users to read/write.

-- RLS HARDENING (OWNER-BASED)
-- Replace with your actual user id if needed:
-- 80abd89b-86f8-4b1e-b666-5a6f4e7fe751

alter table if exists sites add column if not exists owner_id uuid;
alter table if exists employees add column if not exists owner_id uuid;
alter table if exists attendance add column if not exists owner_id uuid;
alter table if exists payroll add column if not exists owner_id uuid;

update sites set owner_id = '80abd89b-86f8-4b1e-b666-5a6f4e7fe751' where owner_id is null;
update employees set owner_id = '80abd89b-86f8-4b1e-b666-5a6f4e7fe751' where owner_id is null;
update attendance set owner_id = '80abd89b-86f8-4b1e-b666-5a6f4e7fe751' where owner_id is null;
update payroll set owner_id = '80abd89b-86f8-4b1e-b666-5a6f4e7fe751' where owner_id is null;

alter table sites alter column owner_id set default auth.uid();
alter table employees alter column owner_id set default auth.uid();
alter table attendance alter column owner_id set default auth.uid();
alter table payroll alter column owner_id set default auth.uid();

alter table sites alter column owner_id set not null;
alter table employees alter column owner_id set not null;
alter table attendance alter column owner_id set not null;
alter table payroll alter column owner_id set not null;

alter table sites enable row level security;
alter table employees enable row level security;
alter table attendance enable row level security;
alter table payroll enable row level security;

alter table mfa_setup_codes enable row level security;

drop policy if exists "mfa_setup_codes_service_role" on mfa_setup_codes;
create policy "mfa_setup_codes_service_role" on mfa_setup_codes
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "sites_owner_select" on sites;
drop policy if exists "sites_owner_insert" on sites;
drop policy if exists "sites_owner_update" on sites;
drop policy if exists "sites_owner_delete" on sites;

create policy "sites_owner_select" on sites
for select using (auth.uid() = owner_id);
create policy "sites_owner_insert" on sites
for insert with check (auth.uid() = owner_id);
create policy "sites_owner_update" on sites
for update using (auth.uid() = owner_id);
create policy "sites_owner_delete" on sites
for delete using (auth.uid() = owner_id);

drop policy if exists "employees_owner_select" on employees;
drop policy if exists "employees_owner_insert" on employees;
drop policy if exists "employees_owner_update" on employees;
drop policy if exists "employees_owner_delete" on employees;

create policy "employees_owner_select" on employees
for select using (auth.uid() = owner_id);
create policy "employees_owner_insert" on employees
for insert with check (auth.uid() = owner_id);
create policy "employees_owner_update" on employees
for update using (auth.uid() = owner_id);
create policy "employees_owner_delete" on employees
for delete using (auth.uid() = owner_id);

drop policy if exists "attendance_owner_select" on attendance;
drop policy if exists "attendance_owner_insert" on attendance;
drop policy if exists "attendance_owner_update" on attendance;
drop policy if exists "attendance_owner_delete" on attendance;

create policy "attendance_owner_select" on attendance
for select using (auth.uid() = owner_id);
create policy "attendance_owner_insert" on attendance
for insert with check (auth.uid() = owner_id);
create policy "attendance_owner_update" on attendance
for update using (auth.uid() = owner_id);
create policy "attendance_owner_delete" on attendance
for delete using (auth.uid() = owner_id);

drop policy if exists "payroll_owner_select" on payroll;
drop policy if exists "payroll_owner_insert" on payroll;
drop policy if exists "payroll_owner_update" on payroll;
drop policy if exists "payroll_owner_delete" on payroll;

create policy "payroll_owner_select" on payroll
for select using (auth.uid() = owner_id);
create policy "payroll_owner_insert" on payroll
for insert with check (auth.uid() = owner_id);
create policy "payroll_owner_update" on payroll
for update using (auth.uid() = owner_id);
create policy "payroll_owner_delete" on payroll
for delete using (auth.uid() = owner_id);
