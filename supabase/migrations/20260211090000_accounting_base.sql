-- Accounting schema baseline (idempotent)
create extension if not exists pgcrypto;

create table if not exists public.accounting_invoices (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('expense', 'income')),
  vendor_or_client text not null,
  invoice_number text,
  date date not null,
  subtotal numeric not null default 0,
  vat numeric not null default 0,
  total numeric not null default 0,
  category int check (category between 1 and 5),
  subcategory text,
  payment_method text,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  file_path text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.accounting_workers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  day_rate numeric not null,
  vat_applicable boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.accounting_timesheets (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.accounting_workers(id),
  date date not null,
  hours numeric not null default 8,
  day_rate numeric not null,
  total_cost numeric not null,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_accounting_invoices_date on public.accounting_invoices (date desc);
create index if not exists idx_accounting_invoices_type on public.accounting_invoices (type);
create index if not exists idx_accounting_invoices_vendor_or_client on public.accounting_invoices (vendor_or_client);
create index if not exists idx_accounting_timesheets_date on public.accounting_timesheets (date desc);

alter table public.accounting_invoices enable row level security;
alter table public.accounting_workers enable row level security;
alter table public.accounting_timesheets enable row level security;

drop policy if exists deny_all_accounting_invoices on public.accounting_invoices;
create policy deny_all_accounting_invoices
  on public.accounting_invoices
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists deny_all_accounting_workers on public.accounting_workers;
create policy deny_all_accounting_workers
  on public.accounting_workers
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists deny_all_accounting_timesheets on public.accounting_timesheets;
create policy deny_all_accounting_timesheets
  on public.accounting_timesheets
  for all
  to anon, authenticated
  using (false)
  with check (false);

insert into storage.buckets (id, name, public)
values ('copo23-invoices', 'copo23-invoices', false)
on conflict (id) do update
set public = excluded.public,
    name = excluded.name;
