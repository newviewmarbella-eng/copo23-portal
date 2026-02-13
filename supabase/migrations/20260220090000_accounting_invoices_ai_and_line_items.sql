create extension if not exists pgcrypto;

alter table if exists public.accounting_invoices
  add column if not exists ai_status text,
  add column if not exists ai_provider text,
  add column if not exists ai_model text,
  add column if not exists ai_extracted_json jsonb,
  add column if not exists ai_confidence numeric,
  add column if not exists ai_warnings text[],
  add column if not exists ai_processed_at timestamptz,
  add column if not exists vendor_name text,
  add column if not exists vendor_tax_id text,
  add column if not exists issue_date date,
  add column if not exists currency text,
  add column if not exists vat_total numeric,
  add column if not exists vat_breakdown jsonb,
  add column if not exists category_main text;

-- Reuse existing column names where possible:
-- invoice_number, subtotal, total already exist in accounting_invoices.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'accounting_invoices_ai_status_check'
      and conrelid = 'public.accounting_invoices'::regclass
  ) then
    alter table public.accounting_invoices
      add constraint accounting_invoices_ai_status_check
      check (
        ai_status is null
        or ai_status in ('pending', 'processing', 'ready', 'needs_review', 'error')
      );
  end if;
end
$$;

create table if not exists public.accounting_invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.accounting_invoices(id) on delete cascade,
  description text,
  qty numeric,
  unit_price numeric,
  line_total numeric,
  vat_rate numeric,
  category text,
  tags text[],
  raw jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_accounting_invoice_line_items_invoice_id
  on public.accounting_invoice_line_items (invoice_id);
