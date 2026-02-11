-- Legacy compatibility migration for accounting_members PIN metadata.
-- IMPORTANT: do not alter or drop constraints on accounting_members.user_id because
-- production may already use user_id as a primary key.
create extension if not exists pgcrypto;

create table if not exists public.accounting_members (
  id uuid primary key default gen_random_uuid(),
  pin_hash text,
  role text,
  author text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.accounting_members
  add column if not exists pin_hash text,
  add column if not exists role text,
  add column if not exists author text,
  add column if not exists active boolean not null default true;

create unique index if not exists idx_accounting_members_pin_hash_unique
  on public.accounting_members (pin_hash)
  where pin_hash is not null;

create unique index if not exists accounting_members_pin_hash_key
  on public.accounting_members (pin_hash)
  where pin_hash is not null;

-- Seed legacy rows idempotently (SHA-256 hex only, never plain PINs).
insert into public.accounting_members (pin_hash, role, author, active)
values
  ('0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c', 'viewer', 'Robbert', true),
  ('edee29f882543b956620b26d0ee0e7e950399b1c4222f5de05e06425b4c995e9', 'viewer', 'Michael', true),
  ('318aee3fed8c9d040d35a7fc1fa776fb31303833aa2de885354ddf3d44d8fb69', 'viewer', 'Nic', true),
  ('a948b46c0f1890667de7b60fb490c573d60c647158f91193dd915afde693529c', 'editor', 'Jesus', true),
  ('8698df0ec492e5026b61ae25e429f82dea81eb962c5fbfa8ed3fd2ac72a968b2', 'editor', 'Jan', true)
on conflict (pin_hash) do update
set role = excluded.role,
    author = excluded.author,
    active = excluded.active;
