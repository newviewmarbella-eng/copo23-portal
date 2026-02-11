alter table if exists public.accounting_invoices
  add column if not exists ocr_text text;
