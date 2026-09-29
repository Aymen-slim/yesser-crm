-- Couples can be removed with their weddings. Packages already null out on weddings.
-- New weddings no longer start with a Cull task. Location is a map link.

alter table public.weddings
  add column if not exists location_url text not null default '';

alter table public.weddings drop constraint if exists weddings_client_id_fkey;
alter table public.weddings
  add constraint weddings_client_id_fkey
  foreign key (client_id) references public.clients (id) on delete cascade;

alter table public.invoices drop constraint if exists invoices_wedding_id_fkey;
alter table public.invoices
  add constraint invoices_wedding_id_fkey
  foreign key (wedding_id) references public.weddings (id) on delete cascade;

delete from public.tasks where title = 'Cull';

create or replace function public.create_wedding(
  p_client_id uuid,
  p_package_id uuid,
  p_lead_id uuid,
  p_wedding_date date,
  p_start_time time,
  p_venue_name text,
  p_city text,
  p_governorate text,
  p_status public.wedding_status,
  p_total_millimes bigint,
  p_day_plan text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_wedding_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only the studio admin can book weddings.' using errcode = '42501';
  end if;

  insert into public.weddings (
    client_id, package_id, lead_id, wedding_date, start_time, venue_name,
    city, governorate, status, total_millimes, day_plan
  )
  values (
    p_client_id, p_package_id, p_lead_id, p_wedding_date, p_start_time,
    coalesce(p_venue_name, ''), coalesce(p_city, ''), coalesce(p_governorate, ''),
    p_status, p_total_millimes, coalesce(p_day_plan, '')
  )
  returning id into v_wedding_id;

  insert into public.tasks (wedding_id, title, assignee_id)
  select v_wedding_id, title, auth.uid()
  from unnest(array['Edit', 'Album', 'Deliver']) as title;

  return v_wedding_id;
end;
$$;
