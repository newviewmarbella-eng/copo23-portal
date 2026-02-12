-- Expand workers/timesheets schema for worker costs and daily attendance (idempotent)

alter table if exists public.accounting_workers
  add column if not exists pay_type text not null default 'day';

alter table if exists public.accounting_workers
  add column if not exists day_rate numeric;

alter table if exists public.accounting_workers
  add column if not exists month_rate numeric;

alter table if exists public.accounting_workers
  add column if not exists ss_day numeric;

alter table if exists public.accounting_workers
  add column if not exists ss_month numeric;

alter table if exists public.accounting_workers
  add column if not exists other_day numeric;

alter table if exists public.accounting_workers
  add column if not exists other_month numeric;

alter table if exists public.accounting_workers
  add column if not exists notes text;

alter table if exists public.accounting_workers
  add column if not exists active boolean not null default true;

alter table if exists public.accounting_workers
  drop constraint if exists accounting_workers_pay_type_check;

alter table if exists public.accounting_workers
  add constraint accounting_workers_pay_type_check check (pay_type in ('day','month'));

alter table if exists public.accounting_timesheets
  add column if not exists work_date date;

alter table if exists public.accounting_timesheets
  add column if not exists present boolean not null default true;

alter table if exists public.accounting_timesheets
  add column if not exists created_at timestamptz not null default now();

update public.accounting_timesheets
set work_date = coalesce(work_date, date)
where work_date is null;

alter table if exists public.accounting_timesheets
  alter column work_date set not null;

create unique index if not exists idx_accounting_timesheets_worker_date_unique
  on public.accounting_timesheets(worker_id, work_date);
