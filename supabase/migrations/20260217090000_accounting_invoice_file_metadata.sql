alter table if exists public.accounting_invoices
  add column if not exists file_name text,
  add column if not exists file_type text;
