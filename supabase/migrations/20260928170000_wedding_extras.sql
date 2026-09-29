-- Tariff extras, and the price agreed for one couple.
-- A catalog change does not rewrite a price already saved on a wedding.

alter table public.weddings
  add column if not exists package_price_millimes bigint
  check (package_price_millimes is null or package_price_millimes >= 0);

create table public.extras (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_millimes bigint not null check (price_millimes >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.wedding_extras (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  extra_id uuid references public.extras (id) on delete set null,
  name text not null,
  price_millimes bigint not null check (price_millimes >= 0),
  created_at timestamptz not null default now()
);

create index wedding_extras_wedding_idx on public.wedding_extras (wedding_id);

insert into public.extras (name, price_millimes)
values
  ('Drone', 800000),
  ('Photobook', 500000),
  ('Girafe', 1000000),
  ('Photobooth', 1200000),
  ('2ème photographe', 500000),
  ('2ème vidéaste', 600000),
  ('Vidéo Guest Messages', 400000),
  ('Diffusion en direct du mariage', 1000000);

alter table public.extras enable row level security;
alter table public.wedding_extras enable row level security;

create policy extras_select on public.extras
  for select to authenticated
  using (public.is_studio_user());

create policy extras_admin_write on public.extras
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy wedding_extras_select on public.wedding_extras
  for select to authenticated
  using (public.is_admin() or public.is_assigned(wedding_id));

create policy wedding_extras_admin_write on public.wedding_extras
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.extras to authenticated;
grant select, insert, update, delete on public.wedding_extras to authenticated;
