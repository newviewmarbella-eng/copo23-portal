# Accounting access SQL

```sql
create table if not exists public.accounting_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'accounting',
  active boolean not null default true,
  invited_by uuid null,
  created_at timestamptz default now()
);

alter table public.accounting_members enable row level security;

create policy "Admins can read accounting members"
  on public.accounting_members
  for select
  using (public.is_admin());

create policy "Admins can insert accounting members"
  on public.accounting_members
  for insert
  with check (public.is_admin());

create policy "Admins can update accounting members"
  on public.accounting_members
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins can delete accounting members"
  on public.accounting_members
  for delete
  using (public.is_admin());
```
