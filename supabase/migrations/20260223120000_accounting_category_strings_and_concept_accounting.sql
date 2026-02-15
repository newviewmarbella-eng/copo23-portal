alter table if exists public.accounting_invoices
  add column if not exists concept_accounting text;

-- Remove legacy CHECK constraints that compare category as numeric (e.g. between 1 and 5)
-- so ALTER TYPE does not try to evaluate text >= integer.
do $$
declare
  rec record;
begin
  for rec in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.accounting_invoices'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%category%'
  loop
    execute format('alter table public.accounting_invoices drop constraint if exists %I', rec.conname);
  end loop;
end
$$;

alter table if exists public.accounting_invoices
  alter column category type text
  using (
    case
      when category is null then null
      when lower(trim(category::text)) in ('1', 'materiales', 'materials') then 'materiales'
      when lower(trim(category::text)) in ('2', 'mano de obra', 'mano_obra', 'mano_de_obra', 'labor', 'labour') then 'mano_de_obra'
      when lower(trim(category::text)) in ('3', 'subcontrata', 'subcontract') then 'subcontrata'
      when lower(trim(category::text)) in ('4', 'alquiler', 'rent', 'rental') then 'alquiler'
      when lower(trim(category::text)) in ('5', 'otros', 'other') then 'otros'
      else 'otros'
    end
  );

update public.accounting_invoices
set category = coalesce(nullif(trim(category), ''), 'otros'),
    subcategory = coalesce(nullif(subcategory, ''), 'otros_otros')
where true;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'accounting_invoices_category_check'
      and conrelid = 'public.accounting_invoices'::regclass
  ) then
    alter table public.accounting_invoices
      add constraint accounting_invoices_category_check
      check (
        category is null
        or category in ('materiales', 'mano_de_obra', 'subcontrata', 'alquiler', 'otros')
      );
  end if;
end
$$;
