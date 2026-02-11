-- Harden accounting_members to use SHA-256 PIN storage and role hierarchy viewer/foreman/editor.
create extension if not exists pgcrypto;

create table if not exists public.accounting_members (
  id uuid primary key default gen_random_uuid(),
  pin_sha256 text unique not null,
  role text not null check (role in ('viewer', 'foreman', 'editor')),
  author text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.accounting_members
  add column if not exists pin_sha256 text,
  add column if not exists role text,
  add column if not exists author text,
  add column if not exists active boolean,
  add column if not exists created_at timestamptz;

-- Migrate legacy columns and values.
update public.accounting_members
set pin_sha256 = coalesce(pin_sha256, pin_hash, case when pin is not null then encode(digest(pin, 'sha256'), 'hex') else null end)
where pin_sha256 is null;

update public.accounting_members
set role = case
  when lower(coalesce(role, '')) = 'manager' then 'foreman'
  when lower(coalesce(role, '')) in ('viewer', 'foreman', 'editor') then lower(role)
  else 'viewer'
end;

update public.accounting_members
set author = coalesce(nullif(trim(author), ''), 'Viewer'),
    active = coalesce(active, is_active, true),
    created_at = coalesce(created_at, now());

alter table public.accounting_members
  alter column pin_sha256 set not null,
  alter column role set not null,
  alter column author set not null,
  alter column active set not null,
  alter column active set default true,
  alter column created_at set not null,
  alter column created_at set default now();

alter table public.accounting_members
  drop constraint if exists accounting_members_role_check;

alter table public.accounting_members
  add constraint accounting_members_role_check
  check (role in ('viewer', 'foreman', 'editor'));

create unique index if not exists idx_accounting_members_pin_sha256_unique
  on public.accounting_members (pin_sha256);

-- Seed known members via hash-only UPSERT; do not delete other members.
insert into public.accounting_members (pin_sha256, role, author, active)
values
  ('a948b46c0f1890667de7b60fb490c573d60c647158f91193dd915afde693529c', 'editor', 'Jesús', true),
  ('8698df0ec492e5026b61ae25e429f82dea81eb962c5fbfa8ed3fd2ac72a968b2', 'editor', 'Jan', true),
  ('0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c', 'viewer', 'Client 1', true),
  ('edee29f882543b956620b26d0ee0e7e950399b1c4222f5de05e06425b4c995e9', 'viewer', 'Client 2', true),
  ('318aee3fed8c9d040d35a7fc1fa776fb31303833aa2de885354ddf3d44d8fb69', 'viewer', 'Client 3', true)
on conflict (pin_sha256) do update
set role = excluded.role,
    author = excluded.author,
    active = true;
