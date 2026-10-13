-- Website contact letters. The public site cannot write this table; the CRM API uses the service role.

create type public.inquiry_status as enum ('new', 'added');

create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  instagram text not null default '',
  wedding_date_text text not null default '',
  wedding_date date,
  venue text not null default '',
  guest_count text not null default '',
  planner text not null default '',
  found_on text not null default '',
  email text,
  phone text,
  status public.inquiry_status not null default 'new',
  lead_id uuid references public.leads (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inquiries_contact_present check (email is not null or phone is not null),
  constraint inquiries_email_shape check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint inquiries_phone_shape check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$')
);

create index inquiries_created_idx on public.inquiries (created_at desc);
create index inquiries_email_idx on public.inquiries (email) where email is not null;
create index inquiries_phone_idx on public.inquiries (phone) where phone is not null;

alter table public.inquiries enable row level security;

revoke all on table public.inquiries from public, anon, authenticated;
grant select, update on table public.inquiries to authenticated;
grant all on table public.inquiries to service_role;

create policy inquiries_manager on public.inquiries
  for all to authenticated
  using (public.can_manage_crm())
  with check (public.can_manage_crm());
