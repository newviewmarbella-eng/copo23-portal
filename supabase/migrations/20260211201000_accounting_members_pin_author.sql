-- Ensure accounting_members is the source of truth for PIN authentication.
create extension if not exists pgcrypto;

create table if not exists public.accounting_members (
  id uuid primary key default gen_random_uuid(),
  pin_hash text not null,
  role text not null,
  author text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.accounting_members
  add column if not exists pin_hash text,
  add column if not exists role text,
  add column if not exists author text,
  add column if not exists active boolean not null default true;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'accounting_members'
      and column_name = 'user_id'
      and is_nullable = 'NO'
  ) then
    alter table public.accounting_members alter column user_id drop not null;
  end if;
end
$$;

create unique index if not exists idx_accounting_members_pin_hash_unique
  on public.accounting_members (pin_hash);

create unique index if not exists accounting_members_pin_hash_key
  on public.accounting_members (pin_hash);

-- Seed initial viewer/editor members (SHA-256 hex only, never plain PINs).
insert into public.accounting_members (pin_hash, role, author, active)
values
  ('0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c', 'viewer', 'Robbert', true),
  ('edee29f882543b956620b26d0ee0e7e950399b1c4222f5de05e06425b4c995e9', 'viewer', 'Michael', true),
  ('318aee3fed8c9d040d35a7fc1fa776fb31303833aa2de885354ddf3d44d8fb69', 'viewer', 'Nic', true),
  ('a9480594e7414a75b0e0a5d1116e7a650526d77d2e70a04e61722ffedc4138b7', 'editor', 'Jesus', true),
  ('869863cb16b6c08ba88302e21e3ce3ae5e188e8290c3b457e55b555f0e1d1e37', 'editor', 'Jan', true)
on conflict (pin_hash) do update
set role = excluded.role,
    author = excluded.author,
    active = excluded.active;

-- Preserve existing editor/manager PIN rows and normalize visible author names.
update public.accounting_members
set author = 'Jesus',
    active = coalesce(active, true)
where lower(coalesce(role, '')) = 'editor'
  and coalesce(author, '') in ('', 'Editor', 'EDITOR', 'Jesus', 'Jesús');

update public.accounting_members
set author = 'Encargado',
    active = coalesce(active, true)
where lower(coalesce(role, '')) = 'manager'
  and coalesce(author, '') in ('', 'Manager', 'MANAGER');
