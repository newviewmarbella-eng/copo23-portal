-- Accounting MVP schema + security for Copo23
-- Run in Supabase SQL editor.

create table if not exists public.accounting_invoices (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('expense','income')),
  vendor_or_client text not null,
  invoice_number text,
  date date not null,
  subtotal numeric not null default 0,
  vat numeric not null default 0,
  total numeric not null default 0,
  category int check (category between 1 and 5),
  subcategory text,
  payment_method text,
  status text not null default 'pending' check (status in ('pending','paid')),
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
  status text not null default 'pending' check (status in ('pending','paid')),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.accounting_invoices enable row level security;
alter table public.accounting_workers enable row level security;
alter table public.accounting_timesheets enable row level security;

-- Block anon/authenticated clients completely. Only service role via Edge Functions.
drop policy if exists "deny_all_accounting_invoices" on public.accounting_invoices;
create policy "deny_all_accounting_invoices" on public.accounting_invoices for all to anon, authenticated using (false) with check (false);

drop policy if exists "deny_all_accounting_workers" on public.accounting_workers;
create policy "deny_all_accounting_workers" on public.accounting_workers for all to anon, authenticated using (false) with check (false);

drop policy if exists "deny_all_accounting_timesheets" on public.accounting_timesheets;
create policy "deny_all_accounting_timesheets" on public.accounting_timesheets for all to anon, authenticated using (false) with check (false);

-- Add editor partner PIN 2244 into your existing PIN table.
-- Adjust table/column names to match your current schema.
-- Example:
-- insert into public.portal_pins(pin, author, role)
-- values ('2244', 'Socio', 'editor')
-- on conflict (pin) do update set role = excluded.role, author = excluded.author;
