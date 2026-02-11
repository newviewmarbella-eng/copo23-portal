-- Make accounting_members lookupable by plain PIN and normalize minimum auth columns.
alter table public.accounting_members
  add column if not exists pin text,
  add column if not exists is_active boolean default true,
  add column if not exists updated_at timestamptz default now();

update public.accounting_members
set pin = coalesce(pin, case pin_hash
  when encode(digest('3573', 'sha256'), 'hex') then '3573'
  when encode(digest('2244', 'sha256'), 'hex') then '2244'
  when encode(digest('1111', 'sha256'), 'hex') then '1111'
  when encode(digest('2222', 'sha256'), 'hex') then '2222'
  when encode(digest('3333', 'sha256'), 'hex') then '3333'
  when encode(digest('0000', 'sha256'), 'hex') then '0000'
  else pin
end)
where pin is null;

update public.accounting_members
set is_active = coalesce(is_active, active, true),
    active = coalesce(active, is_active, true),
    updated_at = now();


update public.accounting_members
set role = coalesce(nullif(trim(role), ''), 'viewer'),
    author = coalesce(nullif(trim(author), ''), 'Viewer'),
    updated_at = now();

alter table public.accounting_members
  alter column role set not null,
  alter column author set not null,
  alter column is_active set default true,
  alter column updated_at set default now();

create unique index if not exists idx_accounting_members_pin_unique
  on public.accounting_members (pin)
  where pin is not null;

-- Keep legacy pin_hash rows in sync when pin is known.
update public.accounting_members
set pin_hash = coalesce(pin_hash, encode(digest(pin, 'sha256'), 'hex')),
    updated_at = now()
where pin is not null;

-- Upsert known viewer/editor members without deleting others.
insert into public.accounting_members (pin, pin_hash, role, author, is_active, active, updated_at)
values
  ('3573', encode(digest('3573', 'sha256'), 'hex'), 'editor', 'Jesús', true, true, now()),
  ('2244', encode(digest('2244', 'sha256'), 'hex'), 'editor', 'Jan', true, true, now()),
  ('1111', encode(digest('1111', 'sha256'), 'hex'), 'viewer', '<Robbert_1111>', true, true, now()),
  ('2222', encode(digest('2222', 'sha256'), 'hex'), 'viewer', '<Michael_2222>', true, true, now()),
  ('3333', encode(digest('3333', 'sha256'), 'hex'), 'viewer', '<Nic_3333>', true, true, now())
on conflict (pin) do update
set role = excluded.role,
    author = excluded.author,
    is_active = true,
    active = true,
    pin_hash = excluded.pin_hash,
    updated_at = now();

-- Keep manager PIN present for slider use if it already exists or can be mapped.
insert into public.accounting_members (pin, pin_hash, role, author, is_active, active, updated_at)
values
  ('0000', encode(digest('0000', 'sha256'), 'hex'), 'manager', 'Encargado', true, true, now())
on conflict (pin) do update
set role = excluded.role,
    author = excluded.author,
    is_active = true,
    active = true,
    pin_hash = excluded.pin_hash,
    updated_at = now();
