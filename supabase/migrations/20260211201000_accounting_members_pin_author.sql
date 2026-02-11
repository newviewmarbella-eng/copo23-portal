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

create unique index if not exists idx_accounting_members_pin_hash_unique
  on public.accounting_members (pin_hash);

-- Seed initial viewer/editor members (PIN is hashed with SHA-256, never stored in plain text).
insert into public.accounting_members (pin_hash, role, author, active)
values
  (encode(digest('1111', 'sha256'), 'hex'), 'viewer', 'Robbert', true),
  (encode(digest('2222', 'sha256'), 'hex'), 'viewer', 'Michael', true),
  (encode(digest('3333', 'sha256'), 'hex'), 'viewer', 'Nic', true),
  (encode(digest('2244', 'sha256'), 'hex'), 'editor', 'Jan', true)
on conflict (pin_hash) do update
set role = excluded.role,
    author = excluded.author,
    active = excluded.active;

-- Preserve existing editor/manager PIN rows and normalize visible author names.
update public.accounting_members
set author = 'Jesús',
    active = coalesce(active, true)
where lower(coalesce(role, '')) = 'editor'
  and coalesce(author, '') in ('', 'Editor', 'EDITOR', 'Jesus');

update public.accounting_members
set author = 'Encargado',
    active = coalesce(active, true)
where lower(coalesce(role, '')) = 'manager'
  and coalesce(author, '') in ('', 'Manager', 'MANAGER');
