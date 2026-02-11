-- Create app-only PIN authentication table used by Edge Functions.
create extension if not exists pgcrypto;

create table if not exists public.app_pins (
  pin_hash text primary key,
  role text not null check (role in ('viewer', 'editor')),
  author text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_pins
  add column if not exists pin_hash text,
  add column if not exists role text,
  add column if not exists author text,
  add column if not exists active boolean,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

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

alter table public.app_pins enable row level security;
revoke all on table public.app_pins from anon;
revoke all on table public.app_pins from authenticated;

insert into public.app_pins (pin_hash, role, author, active, updated_at)
values
  (encode(digest('3573', 'sha256'), 'hex'), 'editor', 'Jesús', true, now()),
  (encode(digest('2244', 'sha256'), 'hex'), 'editor', 'Jan', true, now()),
  (encode(digest('1111', 'sha256'), 'hex'), 'viewer', 'Robbert', true, now()),
  (encode(digest('2222', 'sha256'), 'hex'), 'viewer', 'Michael', true, now()),
  (encode(digest('3333', 'sha256'), 'hex'), 'viewer', 'Nic', true, now())
on conflict (pin_hash) do update
set role = excluded.role,
    author = excluded.author,
    active = excluded.active,
    updated_at = now();
