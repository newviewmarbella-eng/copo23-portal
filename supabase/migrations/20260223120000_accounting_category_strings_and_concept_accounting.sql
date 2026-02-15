alter table if exists public.accounting_invoices
  add column if not exists concept_accounting text;

alter table if exists public.accounting_invoices
  alter column category type text
  using (
    case
      when category::text = '1' then 'materiales'
      when category::text = '2' then 'mano_obra'
      when category::text = '3' then 'subcontrata'
      when category::text = '4' then 'alquiler'
      when category::text = '5' then 'otros'
      when category is null then null
      else lower(category::text)
    end
  );

update public.accounting_invoices
set category = coalesce(nullif(category, ''), 'otros'),
    subcategory = coalesce(nullif(subcategory, ''), 'otros_otros')
where true;
