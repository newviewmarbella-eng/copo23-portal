-- Dedicated PIN authentication table for app access.
-- PIN auth must not rely on accounting_members.
create extension if not exists pgcrypto;

create table if not exists public.app_pins (
  pin_hash text primary key,
  role text not null check (role in ('viewer','editor')),
  author text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.app_pins enable row level security;

insert into public.app_pins (pin_hash, role, author, active)
values
  (encode(digest('1111','sha256'),'hex'), 'viewer','Robbert', true),
  (encode(digest('2222','sha256'),'hex'), 'viewer','Michael', true),
  (encode(digest('3333','sha256'),'hex'), 'viewer','Nic', true),
  (encode(digest('3573','sha256'),'hex'), 'editor','Jesús', true),
  (encode(digest('2244','sha256'),'hex'), 'editor','Jan', true)
on conflict (pin_hash) do update
  set role = excluded.role,
      author = excluded.author,
      active = excluded.active;
