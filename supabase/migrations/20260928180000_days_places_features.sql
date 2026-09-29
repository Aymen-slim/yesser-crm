-- Extra days and places on a wedding. The date and venue on the wedding stay the main ones.
-- Package bullets are copied onto each couple so a tariff edit does not rewrite their list.

alter table public.packages
  add column if not exists features text[] not null default '{}';

alter table public.weddings
  add column if not exists features text[];

update public.weddings as wedding
set features = package.features
from public.packages as package
where wedding.package_id = package.id
  and wedding.features is null;

create table public.wedding_days (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  day_date date not null,
  start_time time,
  label text not null default '',
  created_at timestamptz not null default now(),
  unique (wedding_id, day_date)
);

create index wedding_days_date_idx on public.wedding_days (day_date);
create index wedding_days_wedding_idx on public.wedding_days (wedding_id);

create table public.wedding_locations (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  label text not null default '',
  venue_name text not null default '',
  city text not null default '',
  location_url text not null default '',
  created_at timestamptz not null default now()
);

create index wedding_locations_wedding_idx on public.wedding_locations (wedding_id);

alter table public.wedding_days enable row level security;
alter table public.wedding_locations enable row level security;

create policy wedding_days_select on public.wedding_days
  for select to authenticated
  using (public.is_admin() or public.is_assigned(wedding_id));

create policy wedding_days_admin_write on public.wedding_days
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy wedding_locations_select on public.wedding_locations
  for select to authenticated
  using (public.is_admin() or public.is_assigned(wedding_id));

create policy wedding_locations_admin_write on public.wedding_locations
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.wedding_days to authenticated;
grant select, insert, update, delete on public.wedding_locations to authenticated;
