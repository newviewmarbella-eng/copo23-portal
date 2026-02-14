alter table if exists public.accounting_invoices
  add column if not exists counterparty_name text,
  add column if not exists counterparty_nif text,
  add column if not exists document_date date,
  add column if not exists base_imponible numeric,
  add column if not exists iva_amount numeric,
  add column if not exists vat_breakdown_json jsonb,
  add column if not exists concept text,
  add column if not exists review_status text,
  add column if not exists warnings jsonb,
  add column if not exists processed_at timestamptz,
  add column if not exists ocr_status text;

alter table if exists public.accounting_invoices
  alter column ocr_text type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'accounting_invoices_ocr_status_check'
      and conrelid = 'public.accounting_invoices'::regclass
  ) then
    alter table public.accounting_invoices
      add constraint accounting_invoices_ocr_status_check
      check (ocr_status is null or ocr_status in ('pending', 'processing', 'done', 'error'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'accounting_invoices_review_status_check'
      and conrelid = 'public.accounting_invoices'::regclass
  ) then
    alter table public.accounting_invoices
      add constraint accounting_invoices_review_status_check
      check (review_status is null or review_status in ('needs_review', 'ok'));
  end if;
end
$$;

update public.accounting_invoices
set
  counterparty_name = coalesce(counterparty_name, vendor_name, vendor_or_client),
  counterparty_nif = coalesce(counterparty_nif, vendor_tax_id),
  document_date = coalesce(document_date, issue_date, date),
  base_imponible = coalesce(base_imponible, subtotal),
  iva_amount = coalesce(iva_amount, vat_total, vat),
  vat_breakdown_json = coalesce(vat_breakdown_json, vat_breakdown),
  warnings = coalesce(warnings, to_jsonb(ai_warnings)),
  processed_at = coalesce(processed_at, ai_processed_at),
  ocr_status = coalesce(ocr_status, case when ai_status in ('ready','needs_review') then 'done' when ai_status in ('processing') then 'processing' when ai_status='error' then 'error' else 'pending' end),
  review_status = coalesce(review_status, case when ai_status='needs_review' then 'needs_review' when ai_status='ready' then 'ok' else null end)
where true;
