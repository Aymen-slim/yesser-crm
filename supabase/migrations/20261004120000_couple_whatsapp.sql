alter table public.clients
  add column if not exists whatsapp_phone text
  check (whatsapp_phone is null or whatsapp_phone ~ '^\+[1-9][0-9]{6,14}$');

alter table public.leads
  add column if not exists whatsapp_phone text
  check (whatsapp_phone is null or whatsapp_phone ~ '^\+[1-9][0-9]{6,14}$');

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

  insert into public.clients (partner_one_name, partner_two_name, phone, whatsapp_phone, email, city)
  values (v_lead.partner_one_name, v_lead.partner_two_name, v_lead.phone, v_lead.whatsapp_phone, v_lead.email, v_lead.city)
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

create or replace function public.quick_book(
  p_partner_one_name text,
  p_partner_two_name text,
  p_phone text,
  p_wedding_date date,
  p_venue_name text,
  p_total_millimes bigint,
  p_whatsapp_phone text
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

  insert into public.clients (partner_one_name, partner_two_name, phone, whatsapp_phone)
  values (p_partner_one_name, coalesce(p_partner_two_name, ''), p_phone, nullif(p_whatsapp_phone, ''))
  returning id into v_client_id;

  return public.create_wedding(
    v_client_id, null, null, p_wedding_date, null,
    p_venue_name, '', '', 'reserved', coalesce(p_total_millimes, 0), ''
  );
end;
$$;

revoke all on function public.book_lead(uuid, uuid, date, time, text, text, text, public.wedding_status, bigint, text) from public;
revoke all on function public.quick_book(text, text, text, date, text, bigint, text) from public;
grant execute on function public.book_lead(uuid, uuid, date, time, text, text, text, public.wedding_status, bigint, text) to authenticated;
grant execute on function public.quick_book(text, text, text, date, text, bigint, text) to authenticated;
