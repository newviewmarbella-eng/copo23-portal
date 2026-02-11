-- Restore required viewer/editor PIN access in a fully idempotent way.
-- Never alter accounting_members.user_id constraints; production may use it as PK.
create extension if not exists pgcrypto;

-- Keep legacy accounting_members seeds in sync when the table supports pin_hash.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'accounting_members' and column_name = 'pin_hash'
  ) then
    execute $sql$
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
          active = excluded.active
    $sql$;
  end if;
end
$$;

insert into public.app_pins (pin_hash, role, author, active, updated_at)
values
  (encode(digest('1111', 'sha256'), 'hex'), 'viewer', 'Robbert', true, now()),
  (encode(digest('2222', 'sha256'), 'hex'), 'viewer', 'Michael', true, now()),
  (encode(digest('3333', 'sha256'), 'hex'), 'viewer', 'Nic', true, now()),
  (encode(digest('3573', 'sha256'), 'hex'), 'editor', 'Jesus', true, now()),
  (encode(digest('2244', 'sha256'), 'hex'), 'editor', 'Jan', true, now())
on conflict (pin_hash) do update
set role = excluded.role,
    author = excluded.author,
    active = excluded.active,
    updated_at = now();
