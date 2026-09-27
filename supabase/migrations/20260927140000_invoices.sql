-- Client invoices. Apply in the Supabase SQL editor after the earlier migrations.

create type public.tva_mode as enum ('none', 'added', 'included');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete restrict,
  number text not null unique,
  issued_on date not null,
  tva_mode public.tva_mode not null,
  tva_rate_bps integer not null default 0 check (tva_rate_bps >= 0 and tva_rate_bps <= 10000),
  issuer_name text not null,
  issuer_phone text not null default '',
  issuer_address text not null default '',
  tax_id text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  label text not null,
  amount_millimes bigint not null check (amount_millimes > 0),
  position integer not null default 0
);

create index invoices_wedding_idx on public.invoices (wedding_id);
create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id, position);

alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;

create policy invoices_admin on public.invoices
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy invoice_lines_admin on public.invoice_lines
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.invoices to authenticated;
grant select, insert, update, delete on public.invoice_lines to authenticated;

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
  if not public.is_admin() then
    raise exception 'Only the studio admin can create invoices.' using errcode = '42501';
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

revoke all on function public.create_invoice(uuid, uuid[], date, public.tva_mode, integer, text, text, text, text, text) from public;
grant execute on function public.create_invoice(uuid, uuid[], date, public.tva_mode, integer, text, text, text, text, text) to authenticated;
