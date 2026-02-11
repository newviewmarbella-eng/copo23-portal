-- Ensure direct client access to invoice storage is blocked while keeping access through Edge Functions (service role).
-- NOTE: Do not alter RLS/ownership on storage.objects from this migration; handled by Supabase internals.

drop policy if exists deny_anon_invoice_bucket_select on storage.objects;
create policy deny_anon_invoice_bucket_select
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'copo23-invoices' and false);

drop policy if exists deny_anon_invoice_bucket_write on storage.objects;
create policy deny_anon_invoice_bucket_write
  on storage.objects
  for all
  to anon, authenticated
  using (bucket_id = 'copo23-invoices' and false)
  with check (bucket_id = 'copo23-invoices' and false);
