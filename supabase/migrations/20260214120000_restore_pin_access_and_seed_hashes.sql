-- Restore PIN access for viewer/editor members and keep migration idempotent.

-- If legacy user_id exists, allow null so PIN-only seed rows can be inserted.
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

create unique index if not exists accounting_members_pin_hash_key
  on public.accounting_members (pin_hash);

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

-- Keep SHA-256 mirror columns/tables in sync when present.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'accounting_members'
      and column_name = 'pin_sha256'
  ) then
    update public.accounting_members
    set pin_sha256 = pin_hash
    where pin_hash is not null
      and (pin_sha256 is null or pin_sha256 = '');
  end if;
end
$$;

insert into public.app_pins (pin_sha256, role, author, active)
values
  ('0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c', 'viewer', 'Robbert', true),
  ('edee29f882543b956620b26d0ee0e7e950399b1c4222f5de05e06425b4c995e9', 'viewer', 'Michael', true),
  ('318aee3fed8c9d040d35a7fc1fa776fb31303833aa2de885354ddf3d44d8fb69', 'viewer', 'Nic', true),
  ('a9480594e7414a75b0e0a5d1116e7a650526d77d2e70a04e61722ffedc4138b7', 'editor', 'Jesus', true),
  ('869863cb16b6c08ba88302e21e3ce3ae5e188e8290c3b457e55b555f0e1d1e37', 'editor', 'Jan', true)
on conflict (pin_sha256) do update
set role = excluded.role,
    author = excluded.author,
    active = excluded.active;
