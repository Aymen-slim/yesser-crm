-- Filled blanks for the Yesser Barka contract. The legal text stays in the app.
-- Safe to run again: creates the table, or upgrades the earlier version that stored terms.

create table if not exists public.contracts (
  wedding_id uuid primary key references public.weddings (id) on delete cascade,
  fields jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint contracts_fields_object check (jsonb_typeof(fields) = 'object')
);

alter table public.contracts
  add column if not exists fields jsonb not null default '{}'::jsonb;

alter table public.contracts
  add column if not exists updated_at timestamptz not null default now();

alter table public.contracts drop constraint if exists contracts_terms_length;
alter table public.contracts drop column if exists terms;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contracts_fields_object'
      and conrelid = 'public.contracts'::regclass
  ) then
    alter table public.contracts
      add constraint contracts_fields_object check (jsonb_typeof(fields) = 'object');
  end if;
end $$;

alter table public.contracts enable row level security;

drop policy if exists contracts_admin on public.contracts;
create policy contracts_admin on public.contracts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.contracts to authenticated;
