-- Yesser studio CRM. Apply in the Supabase SQL editor or via the Supabase CLI.
-- After creating Yesser in Authentication, insert his profile:
--   insert into public.profiles (id, role, full_name)
--   values ('AUTH_USER_UUID', 'admin', 'Yesser');

create type public.app_role as enum ('admin', 'member');
create type public.lead_source as enum ('instagram', 'facebook', 'whatsapp', 'referral', 'phone', 'other');
create type public.lead_status as enum ('new', 'contacted', 'quote_sent', 'booked', 'lost');
create type public.wedding_status as enum ('reserved', 'confirmed', 'shot', 'editing', 'delivered', 'cancelled');
create type public.payment_method as enum ('cash', 'bank_transfer', 'other');
create type public.task_status as enum ('todo', 'doing', 'done');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'member',
  full_name text not null,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  price_millimes bigint not null check (price_millimes >= 0),
  coverage_hours numeric(4, 1) not null default 0 check (coverage_hours >= 0),
  photo_count integer not null default 0 check (photo_count >= 0),
  includes_album boolean not null default false,
  includes_video boolean not null default false,
  includes_drone boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  partner_one_name text not null,
  partner_two_name text not null default '',
  phone text not null,
  email text,
  city text not null default '',
  created_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  partner_one_name text not null,
  partner_two_name text not null default '',
  phone text not null,
  email text,
  source public.lead_source not null default 'other',
  city text not null default '',
  venue text not null default '',
  wedding_date date,
  status public.lead_status not null default 'new',
  package_id uuid references public.packages (id) on delete set null,
  converted_client_id uuid references public.clients (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.weddings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  package_id uuid references public.packages (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  wedding_date date not null,
  start_time time,
  venue_name text not null default '',
  city text not null default '',
  governorate text not null default '',
  status public.wedding_status not null default 'reserved',
  total_millimes bigint not null default 0 check (total_millimes >= 0),
  day_plan text not null default '',
  created_at timestamptz not null default now()
);

create table public.wedding_assignments (
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  role_on_day text not null default 'photographer',
  primary key (wedding_id, member_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  label text not null,
  amount_millimes bigint not null check (amount_millimes > 0),
  due_date date,
  paid_at date,
  method public.payment_method,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  title text not null,
  due_date date,
  status public.task_status not null default 'todo',
  assignee_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid references public.weddings (id) on delete set null,
  category text not null,
  amount_millimes bigint not null check (amount_millimes > 0),
  spent_on date not null,
  note text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads (id) on delete cascade,
  wedding_id uuid references public.weddings (id) on delete cascade,
  body text not null,
  author_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint notes_target check (lead_id is not null or wedding_id is not null)
);

create index leads_status_idx on public.leads (status);
create index weddings_date_idx on public.weddings (wedding_date);
create index weddings_client_idx on public.weddings (client_id);
create index assignments_member_idx on public.wedding_assignments (member_id);
create index payments_due_idx on public.payments (due_date);
create index payments_paid_idx on public.payments (paid_at);
create index expenses_spent_idx on public.expenses (spent_on);
create index tasks_wedding_idx on public.tasks (wedding_id);
create index notes_wedding_idx on public.notes (wedding_id);
create index notes_lead_idx on public.notes (lead_id);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active
  );
$$;

create or replace function public.is_studio_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active
  );
$$;

create or replace function public.is_assigned(wedding uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.wedding_assignments
    where wedding_id = wedding and member_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_studio_user() from public;
revoke all on function public.is_assigned(uuid) from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_studio_user() to authenticated;
grant execute on function public.is_assigned(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.packages enable row level security;
alter table public.clients enable row level security;
alter table public.leads enable row level security;
alter table public.weddings enable row level security;
alter table public.wedding_assignments enable row level security;
alter table public.payments enable row level security;
alter table public.tasks enable row level security;
alter table public.expenses enable row level security;
alter table public.files enable row level security;
alter table public.notes enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated
  using (public.is_studio_user());

create policy profiles_admin_insert on public.profiles
  for insert to authenticated
  with check (public.is_admin());

create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy packages_select on public.packages
  for select to authenticated
  using (public.is_studio_user());

create policy packages_admin_write on public.packages
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy clients_select on public.clients
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.weddings w
      where w.client_id = clients.id and public.is_assigned(w.id)
    )
  );

create policy clients_admin_write on public.clients
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy leads_admin on public.leads
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy weddings_select on public.weddings
  for select to authenticated
  using (public.is_admin() or public.is_assigned(id));

create policy weddings_admin_insert on public.weddings
  for insert to authenticated
  with check (public.is_admin());

create policy weddings_admin_update on public.weddings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy weddings_admin_delete on public.weddings
  for delete to authenticated
  using (public.is_admin());

create policy assignments_select on public.wedding_assignments
  for select to authenticated
  using (public.is_admin() or public.is_assigned(wedding_id));

create policy assignments_admin_write on public.wedding_assignments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy payments_admin on public.payments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy tasks_select on public.tasks
  for select to authenticated
  using (public.is_admin() or public.is_assigned(wedding_id));

create policy tasks_write on public.tasks
  for insert to authenticated
  with check (public.is_admin() or public.is_assigned(wedding_id));

create policy tasks_update on public.tasks
  for update to authenticated
  using (public.is_admin() or public.is_assigned(wedding_id))
  with check (public.is_admin() or public.is_assigned(wedding_id));

create policy tasks_delete on public.tasks
  for delete to authenticated
  using (public.is_admin());

create policy expenses_admin on public.expenses
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy files_select on public.files
  for select to authenticated
  using (public.is_admin() or public.is_assigned(wedding_id));

create policy files_insert on public.files
  for insert to authenticated
  with check (public.is_admin() or public.is_assigned(wedding_id));

create policy files_delete on public.files
  for delete to authenticated
  using (public.is_admin());

create policy notes_select on public.notes
  for select to authenticated
  using (
    public.is_admin()
    or (wedding_id is not null and public.is_assigned(wedding_id))
  );

create policy notes_insert on public.notes
  for insert to authenticated
  with check (
    public.is_admin()
    or (wedding_id is not null and lead_id is null and public.is_assigned(wedding_id))
  );

create policy notes_delete on public.notes
  for delete to authenticated
  using (public.is_admin());

insert into storage.buckets (id, name, public)
values ('studio-files', 'studio-files', false)
on conflict (id) do nothing;

create policy studio_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'studio-files'
    and (
      public.is_admin()
      or public.is_assigned((storage.foldername(name))[1]::uuid)
    )
  );

create policy studio_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'studio-files'
    and (
      public.is_admin()
      or public.is_assigned((storage.foldername(name))[1]::uuid)
    )
  );

create policy studio_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'studio-files' and public.is_admin());
