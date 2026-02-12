alter table if exists public.accounting_invoices
  add column if not exists idempotency_key text;

create unique index if not exists idx_accounting_invoices_idempotency_key_unique
  on public.accounting_invoices (idempotency_key)
  where idempotency_key is not null;
