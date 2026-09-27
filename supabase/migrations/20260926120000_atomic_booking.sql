-- Booking a wedding writes to several tables. These functions run each booking
-- in one transaction so a failure part-way never leaves orphan rows.
-- They run as the calling user, so row level security still applies.

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
  from unnest(array['Cull', 'Edit', 'Album', 'Deliver']) as title;

  return v_wedding_id;
end;
$$;

create or replace function public.book_lead(
  p_lead_id uuid,
  p_package_id uuid,
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
  v_lead public.leads%rowtype;
  v_client_id uuid;
  v_wedding_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only the studio admin can book weddings.' using errcode = '42501';
  end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;
  if v_lead.converted_client_id is not null then
    raise exception 'This lead is already booked.' using errcode = 'P0001';
  end if;

  insert into public.clients (partner_one_name, partner_two_name, phone, email, city)
  values (v_lead.partner_one_name, v_lead.partner_two_name, v_lead.phone, v_lead.email, v_lead.city)
  returning id into v_client_id;

  v_wedding_id := public.create_wedding(
    v_client_id, p_package_id, p_lead_id, p_wedding_date, p_start_time,
    p_venue_name, p_city, p_governorate, p_status, p_total_millimes, p_day_plan
  );

  update public.leads
  set status = 'booked', converted_client_id = v_client_id
  where id = p_lead_id;

  return v_wedding_id;
end;
$$;

revoke all on function public.create_wedding(uuid, uuid, uuid, date, time, text, text, text, public.wedding_status, bigint, text) from public;
revoke all on function public.book_lead(uuid, uuid, date, time, text, text, text, public.wedding_status, bigint, text) from public;
grant execute on function public.create_wedding(uuid, uuid, uuid, date, time, text, text, text, public.wedding_status, bigint, text) to authenticated;
grant execute on function public.book_lead(uuid, uuid, date, time, text, text, text, public.wedding_status, bigint, text) to authenticated;
