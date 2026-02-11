-- Unified PIN store for Edge Functions.
create extension if not exists pgcrypto;

create table if not exists public.app_pins (
  id uuid primary key default gen_random_uuid(),
  pin_sha256 text unique not null,
  role text not null check (role in ('viewer', 'client', 'manager', 'admin', 'editor')),
  author text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Backfill from legacy accounting_members without deleting existing app_pins rows.
insert into public.app_pins (pin_sha256, role, author, active)
select
  coalesce(
    nullif(trim(am.pin_sha256), ''),
    nullif(trim(am.pin_hash), ''),
    case when nullif(trim(am.pin), '') is not null then encode(digest(trim(am.pin), 'sha256'), 'hex') else null end
  ) as pin_sha256,
  case
    when lower(coalesce(am.role, '')) = 'foreman' then 'manager'
    when lower(coalesce(am.role, '')) in ('viewer', 'client', 'manager', 'admin', 'editor') then lower(am.role)
    else 'viewer'
  end as role,
  coalesce(nullif(trim(am.author), ''), 'Viewer') as author,
  coalesce(am.active, am.is_active, true) as active
from public.accounting_members am
where coalesce(
    nullif(trim(am.pin_sha256), ''),
    nullif(trim(am.pin_hash), ''),
    case when nullif(trim(am.pin), '') is not null then encode(digest(trim(am.pin), 'sha256'), 'hex') else null end
  ) is not null
on conflict (pin_sha256) do update
set role = excluded.role,
    author = excluded.author,
    active = excluded.active;

-- Ensure key project PINs exist with expected ownership/roles.
insert into public.app_pins (pin_sha256, role, author, active)
values
  (encode(digest('3573', 'sha256'), 'hex'), 'admin', 'Jesus', true),
  (encode(digest('2244', 'sha256'), 'hex'), 'editor', 'Jan', true)
on conflict (pin_sha256) do update
set role = excluded.role,
    author = excluded.author,
    active = excluded.active;
