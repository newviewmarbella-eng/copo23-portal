-- Dedicated PIN authentication table used by Edge Functions.
create extension if not exists pgcrypto;

create table if not exists public.app_pins (
  pin_hash text primary key,
  role text not null check (role in ('viewer', 'editor')),
  author text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Compatibility for environments where app_pins already exists with old columns.
alter table public.app_pins
  add column if not exists pin_hash text,
  add column if not exists role text,
  add column if not exists author text,
  add column if not exists active boolean,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_pins' and column_name = 'pin_sha256'
  ) then
    execute 'update public.app_pins set pin_hash = coalesce(pin_hash, pin_sha256) where pin_hash is null';
  end if;
end
$$;

update public.app_pins
set role = case when lower(coalesce(role, '')) = 'editor' then 'editor' else 'viewer' end
where role is null or lower(role) not in ('viewer', 'editor');

update public.app_pins
set author = coalesce(nullif(trim(author), ''), 'Viewer')
where author is null or trim(author) = '';

update public.app_pins
set active = coalesce(active, true)
where active is null;

update public.app_pins
set created_at = coalesce(created_at, now())
where created_at is null;

update public.app_pins
set updated_at = coalesce(updated_at, now())
where updated_at is null;

create unique index if not exists app_pins_pin_hash_key on public.app_pins (pin_hash);

alter table public.app_pins
  alter column pin_hash set not null,
  alter column role set not null,
  alter column author set not null,
  alter column active set not null,
  alter column active set default true,
  alter column created_at set not null,
  alter column created_at set default now(),
  alter column updated_at set not null,
  alter column updated_at set default now();

-- Lock down table from anon/authenticated access.
alter table public.app_pins enable row level security;
revoke all on table public.app_pins from anon;
revoke all on table public.app_pins from authenticated;

-- Backfill from legacy accounting_members when available.
insert into public.app_pins (pin_hash, role, author, active, updated_at)
select
  coalesce(
    nullif(trim(to_jsonb(am)->>'pin_hash'), ''),
    nullif(trim(to_jsonb(am)->>'pin_sha256'), ''),
    case when nullif(trim(to_jsonb(am)->>'pin'), '') is not null then encode(digest(trim(to_jsonb(am)->>'pin'), 'sha256'), 'hex') else null end
  ) as pin_hash,
  case when lower(coalesce(to_jsonb(am)->>'role', '')) = 'editor' then 'editor' else 'viewer' end as role,
  coalesce(nullif(trim(to_jsonb(am)->>'author'), ''), 'Viewer') as author,
  coalesce((to_jsonb(am)->>'active')::boolean, (to_jsonb(am)->>'is_active')::boolean, true) as active,
  now() as updated_at
from public.accounting_members am
where coalesce(
    nullif(trim(to_jsonb(am)->>'pin_hash'), ''),
    nullif(trim(to_jsonb(am)->>'pin_sha256'), ''),
    case when nullif(trim(to_jsonb(am)->>'pin'), '') is not null then encode(digest(trim(to_jsonb(am)->>'pin'), 'sha256'), 'hex') else null end
  ) is not null
on conflict (pin_hash) do update
set role = excluded.role,
    author = excluded.author,
    active = excluded.active,
    updated_at = now();

-- Ensure required project PINs are present.
insert into public.app_pins (pin_hash, role, author, active, updated_at)
values
  (encode(digest('3573', 'sha256'), 'hex'), 'editor', 'Jesus', true, now()),
  (encode(digest('2244', 'sha256'), 'hex'), 'editor', 'Jan', true, now()),
  (encode(digest('1111', 'sha256'), 'hex'), 'viewer', 'Robbert', true, now()),
  (encode(digest('2222', 'sha256'), 'hex'), 'viewer', 'Michael', true, now()),
  (encode(digest('3333', 'sha256'), 'hex'), 'viewer', 'Nic', true, now())
on conflict (pin_hash) do update
set role = excluded.role,
    author = excluded.author,
    active = excluded.active,
    updated_at = now();
