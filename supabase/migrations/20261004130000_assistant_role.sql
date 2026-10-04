alter type public.app_role add value if not exists 'assistant';

create or replace function public.can_manage_crm()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role::text in ('admin', 'assistant') and active
  );
$$;

revoke all on function public.can_manage_crm() from public;
grant execute on function public.can_manage_crm() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'clients', 'leads', 'weddings', 'packages', 'extras', 'wedding_extras',
    'wedding_days', 'wedding_locations', 'wedding_assignments', 'payments',
    'expenses', 'tasks', 'notes', 'files', 'member_rates', 'assignment_pay',
    'invoices', 'invoice_lines', 'contracts'
  ] loop
    execute format(
      'create policy crm_manager_all on public.%I for all to authenticated using (public.can_manage_crm()) with check (public.can_manage_crm())',
      table_name
    );
  end loop;
end;
$$;

create policy studio_files_manager_select on storage.objects
  for select to authenticated
  using (bucket_id = 'studio-files' and public.can_manage_crm());

create policy studio_files_manager_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'studio-files' and public.can_manage_crm());

create policy studio_files_manager_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'studio-files' and public.can_manage_crm());

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
  if not public.can_manage_crm() then
    raise exception 'Only CRM managers can book weddings.' using errcode = '42501';
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
  if not public.can_manage_crm() then
    raise exception 'Only CRM managers can book weddings.' using errcode = '42501';
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
  if not public.can_manage_crm() then
    raise exception 'Only CRM managers can book weddings.' using errcode = '42501';
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

create or replace function public.create_invoice(
  p_wedding_id uuid,
  p_payment_ids uuid[],
  p_issued_on date,
  p_tva_mode public.tva_mode,
  p_tva_rate_bps integer,
  p_issuer_name text,
  p_issuer_phone text,
  p_issuer_address text,
  p_tax_id text,
  p_note text
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_year text;
  v_seq int;
  v_id uuid;
  v_count int;
  v_ids uuid[];
begin
  if not public.can_manage_crm() then
    raise exception 'Only CRM managers can create invoices.' using errcode = '42501';
  end if;

  v_ids := coalesce(p_payment_ids, '{}'::uuid[]);
  select coalesce(array_agg(distinct payment_id), '{}'::uuid[])
  into v_ids
  from unnest(v_ids) as payment_id;

  if v_ids is null or cardinality(v_ids) = 0 then
    raise exception 'Choose at least one payment.' using errcode = '22023';
  end if;

  if p_tva_rate_bps < 0 or p_tva_rate_bps > 10000 then
    raise exception 'Invalid TVA rate.' using errcode = '22023';
  end if;

  if p_tva_mode <> 'none' and p_tva_rate_bps < 1 then
    raise exception 'Invalid TVA rate.' using errcode = '22023';
  end if;

  select count(*) into v_count
  from public.payments
  where wedding_id = p_wedding_id
    and id = any(v_ids);

  if v_count <> cardinality(v_ids) then
    raise exception 'Those payments are not on this wedding.' using errcode = '22023';
  end if;

  v_year := to_char(p_issued_on, 'YYYY');
  perform pg_advisory_xact_lock(hashtext('invoice-' || v_year)::bigint);

  select coalesce(max(split_part(number, '-', 2)::int), 0) + 1
  into v_seq
  from public.invoices
  where number like v_year || '-%';

  insert into public.invoices (
    wedding_id, number, issued_on, tva_mode, tva_rate_bps,
    issuer_name, issuer_phone, issuer_address, tax_id, note
  ) values (
    p_wedding_id,
    v_year || '-' || lpad(v_seq::text, 4, '0'),
    p_issued_on,
    p_tva_mode,
    case when p_tva_mode = 'none' then 0 else p_tva_rate_bps end,
    p_issuer_name,
    coalesce(p_issuer_phone, ''),
    coalesce(p_issuer_address, ''),
    coalesce(p_tax_id, ''),
    coalesce(p_note, '')
  ) returning id into v_id;

  insert into public.invoice_lines (invoice_id, label, amount_millimes, position)
  select v_id, p.label, p.amount_millimes, row_number() over (order by p.due_date nulls last, p.created_at)::int
  from public.payments p
  where p.id = any(v_ids);

  return v_id;
end;
$$;

revoke all on function public.create_wedding(uuid, uuid, uuid, date, time, text, text, text, public.wedding_status, bigint, text) from public;
revoke all on function public.book_lead(uuid, uuid, date, time, text, text, text, public.wedding_status, bigint, text) from public;
revoke all on function public.quick_book(text, text, text, date, text, bigint, text) from public;
revoke all on function public.create_invoice(uuid, uuid[], date, public.tva_mode, integer, text, text, text, text, text) from public;
grant execute on function public.create_wedding(uuid, uuid, uuid, date, time, text, text, text, public.wedding_status, bigint, text) to authenticated;
grant execute on function public.book_lead(uuid, uuid, date, time, text, text, text, public.wedding_status, bigint, text) to authenticated;
grant execute on function public.quick_book(text, text, text, date, text, bigint, text) to authenticated;
grant execute on function public.create_invoice(uuid, uuid[], date, public.tva_mode, integer, text, text, text, text, text) to authenticated;
