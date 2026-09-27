-- Team members no longer need a login: a profile can exist without an auth user.
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();
alter table public.profiles
  add column if not exists job text not null default '',
  add column if not exists instagram text not null default '',
  add column if not exists has_login boolean not null default true;

-- Pay is kept out of profiles so team members who can sign in never see each other's rates.
create table if not exists public.member_rates (
  member_id uuid primary key references public.profiles (id) on delete cascade,
  rate_millimes bigint not null default 0 check (rate_millimes >= 0)
);

create table if not exists public.assignment_pay (
  wedding_id uuid not null,
  member_id uuid not null,
  amount_millimes bigint not null default 0 check (amount_millimes >= 0),
  paid_at date,
  primary key (wedding_id, member_id),
  foreign key (wedding_id, member_id)
    references public.wedding_assignments (wedding_id, member_id) on delete cascade
);

create index if not exists assignment_pay_paid_idx on public.assignment_pay (paid_at);

alter table public.member_rates enable row level security;
alter table public.assignment_pay enable row level security;

drop policy if exists member_rates_admin on public.member_rates;
create policy member_rates_admin on public.member_rates
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists assignment_pay_admin on public.assignment_pay;
create policy assignment_pay_admin on public.assignment_pay
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_delete on public.profiles
  for delete to authenticated
  using (public.is_admin() and not has_login);

-- Calendar quick add: new couple and wedding in one transaction.
create or replace function public.quick_book(
  p_partner_one_name text,
  p_partner_two_name text,
  p_phone text,
  p_wedding_date date,
  p_venue_name text,
  p_total_millimes bigint
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_client_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only the studio admin can book weddings.' using errcode = '42501';
  end if;

  insert into public.clients (partner_one_name, partner_two_name, phone)
  values (p_partner_one_name, coalesce(p_partner_two_name, ''), p_phone)
  returning id into v_client_id;

  return public.create_wedding(
    v_client_id, null, null, p_wedding_date, null,
    p_venue_name, '', '', 'reserved', coalesce(p_total_millimes, 0), ''
  );
end;
$$;

revoke all on function public.quick_book(text, text, text, date, text, bigint) from public;
grant execute on function public.quick_book(text, text, text, date, text, bigint) to authenticated;
