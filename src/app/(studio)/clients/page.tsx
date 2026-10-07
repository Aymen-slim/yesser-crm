import Link from "next/link";
import { ClientForm, LeadForm } from "@/components/record-forms";
import {
  Banner,
  ContactLinks,
  Disclosure,
  EmptyRow,
  EmptyState,
  Field,
  FilterTabs,
  PageHeader,
  Pagination,
  PhoneCard,
  PhoneList,
  StatusBadge,
  TableCard,
  coupleName,
} from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { PAGE_SIZE, formatDate } from "@/lib/constants";
import { fill, getMessages, term } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { getWhatsappPhones } from "@/lib/supabase/contacts";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  return { title: getMessages(await getLocale()).nav.couples };
}

const TABS = ["leads", "booked", "lost"] as const;
const OPEN_LEAD_STATUSES = ["new", "contacted", "quote_sent"];
const NIL = "00000000-0000-0000-0000-000000000000";

type ClientRow = {
  id: string;
  partner_one_name: string;
  partner_two_name: string;
  phone: string;
  email: string | null;
  city: string;
  weddings: { wedding_date: string }[] | null;
};

type CoupleFilterQuery = {
  or(filters: string): unknown;
  ilike(column: string, pattern: string): unknown;
  gte(column: string, value: string): unknown;
  lte(column: string, value: string): unknown;
  in(column: string, values: readonly string[]): unknown;
};

function searchText(value: string | undefined) {
  return (value ?? "")
    .replace(/[%_\\()"']/g, "")
    .replace(/,/g, " ")
    .trim()
    .slice(0, 80);
}

function isoDate(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function likePattern(value: string) {
  return `"%${value}%"`;
}

export default async function CouplesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; page?: string; tab?: string; q?: string; city?: string; from?: string; to?: string }>;
}) {
  await requireManager();
  const locale = await getLocale();
  const messages = getMessages(locale);
  const params = await searchParams;
  const tab = TABS.find((value) => value === params.tab) ?? "leads";
  const page = Math.max(1, Number(params.page) || 1);
  const fromRow = (page - 1) * PAGE_SIZE;
  const q = searchText(params.q);
  let from = isoDate(params.from);
  let to = isoDate(params.to);
  if (from && to && from > to) [from, to] = [to, from];
  const city = searchText(params.city);
  const filters = { tab, ...(q ? { q } : {}), ...(city ? { city } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) };
  const supabase = await createClient();

  let dateIds: string[] | null = null;
  let cityIds: string[] = [];
  if (from || to || city) {
    let dates = supabase.from("weddings").select("client_id");
    if (from) dates = dates.gte("wedding_date", from);
    if (to) dates = dates.lte("wedding_date", to);
    const [dated, placed] = await Promise.all([
      from || to ? dates : Promise.resolve({ data: null }),
      city ? supabase.from("weddings").select("client_id").ilike("city", `%${city}%`) : Promise.resolve({ data: null }),
    ]);
    if (from || to) dateIds = [...new Set((dated.data ?? []).map((row) => row.client_id))];
    cityIds = [...new Set((placed.data ?? []).map((row) => row.client_id))];
  }

  const filterLeads = <T,>(query: T) => {
    const builder = query as CoupleFilterQuery;
    if (q) builder.or(`partner_one_name.ilike.${likePattern(q)},partner_two_name.ilike.${likePattern(q)}`);
    if (city) builder.ilike("city", `%${city}%`);
    if (from) builder.gte("wedding_date", from);
    if (to) builder.lte("wedding_date", to);
    return query;
  };

  const filterClients = <T,>(query: T) => {
    const builder = query as CoupleFilterQuery;
    if (q) builder.or(`partner_one_name.ilike.${likePattern(q)},partner_two_name.ilike.${likePattern(q)}`);
    if (dateIds) builder.in("id", dateIds.length ? dateIds : [NIL]);
    if (city) {
      const parts = [`city.ilike.${likePattern(city)}`];
      if (cityIds.length) parts.push(`id.in.(${cityIds.join(",")})`);
      builder.or(parts.join(","));
    }
    return query;
  };

  const leadsQuery = (statuses: string[]) =>
    filterLeads(
      supabase
        .from("leads")
        .select("id, partner_one_name, partner_two_name, phone, source, status, wedding_date, city", { count: "exact" })
        .in("status", statuses),
    )
      .order("created_at", { ascending: false })
      .range(fromRow, fromRow + PAGE_SIZE - 1);

  const skip = Promise.resolve({ data: null, error: null, count: 0 });
  const [clients, leads, packages, leadCount, bookedCount, lostCount] = await Promise.all([
    tab === "booked"
      ? filterClients(
          supabase
            .from("clients")
            .select("id, partner_one_name, partner_two_name, phone, email, city, weddings(wedding_date)", { count: "exact" }),
        )
          .order("created_at", { ascending: false })
          .range(fromRow, fromRow + PAGE_SIZE - 1)
          .overrideTypes<ClientRow[], { merge: false }>()
      : skip,
    tab === "booked" ? skip : leadsQuery(tab === "lost" ? ["lost"] : OPEN_LEAD_STATUSES),
    tab === "leads" ? supabase.from("packages").select("id, name").eq("active", true).order("name") : Promise.resolve({ data: [] }),
    filterLeads(supabase.from("leads").select("id", { count: "exact", head: true }).in("status", OPEN_LEAD_STATUSES)),
    filterClients(supabase.from("clients").select("id", { count: "exact", head: true })),
    filterLeads(supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "lost")),
  ]);

  const lookupError = clients.error ?? leads.error;
  if (lookupError) {
    console.error("Couples lookup failed:", lookupError.code);
    throw new Error("couples_failed");
  }
  const clientRows = clients.data ?? [];
  const leadRows = (leads.data ?? []) as {
    id: string;
    partner_one_name: string;
    partner_two_name: string;
    phone: string;
    source: string;
    status: string;
    wedding_date: string | null;
    city: string;
  }[];
  const whatsappPhones = await getWhatsappPhones(
    supabase,
    tab === "booked" ? "clients" : "leads",
    (tab === "booked" ? clientRows : leadRows).map((row) => row.id),
  );
  const total = (tab === "booked" ? clients.count : leads.count) ?? 0;
  const hrefFor = (value: (typeof TABS)[number]) => {
    const search = new URLSearchParams({ tab: value });
    if (q) search.set("q", q);
    if (city) search.set("city", city);
    if (from) search.set("from", from);
    if (to) search.set("to", to);
    return `/clients?${search}`;
  };
  const filtering = Boolean(q || city || from || to);

  return (
    <div>
      <PageHeader title={messages.couples.title} subtitle={messages.couples.subtitle} />
      <Banner error={params.error} notice={params.notice} />
      <FilterTabs
        active={tab}
        items={[
          { value: "leads", label: fill(messages.couples.tabLeads, { count: leadCount.count ?? 0 }), href: hrefFor("leads") },
          { value: "booked", label: fill(messages.couples.tabBooked, { count: bookedCount.count ?? 0 }), href: hrefFor("booked") },
          { value: "lost", label: fill(messages.couples.tabLost, { count: lostCount.count ?? 0 }), href: hrefFor("lost") },
        ]}
      />

      <form method="get" className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <input type="hidden" name="tab" value={tab} />
        <Field label={messages.couples.filterName}>
          <input name="q" defaultValue={q} placeholder={messages.couples.nameHint} />
        </Field>
        <Field label={messages.couples.filterPlace}>
          <input name="city" defaultValue={city} placeholder={messages.couples.placeHint} />
        </Field>
        <Field label={messages.couples.filterFrom}>
          <input name="from" type="date" defaultValue={from} />
        </Field>
        <Field label={messages.couples.filterTo}>
          <input name="to" type="date" defaultValue={to} />
        </Field>
        <div className="flex items-end gap-2 lg:col-span-2">
          <button type="submit">{messages.couples.filterApply}</button>
          {filtering ? (
            <Link href={`/clients?tab=${tab}`} className="button ghost no-underline">
              {messages.couples.filterClear}
            </Link>
          ) : null}
        </div>
      </form>

      {tab === "leads" ? (
        <Disclosure label={messages.couples.newLead} open={Boolean(params.error)}>
          <LeadForm packages={packages.data ?? []} />
        </Disclosure>
      ) : null}
      {tab === "booked" ? (
        <Disclosure label={messages.couples.newCouple} open={Boolean(params.error)}>
          <ClientForm />
        </Disclosure>
      ) : null}

      <PhoneList>
        {tab === "booked" ? (
          clientRows.length === 0 ? (
            <EmptyState>{messages.couples.noBooked}</EmptyState>
          ) : (
            clientRows.map((client) => {
              const dates = ((client.weddings ?? []) as { wedding_date: string }[]).map((w) => w.wedding_date).sort();
              return (
                <PhoneCard key={client.id}>
                  <Link href={`/clients/${client.id}`} className="font-medium">
                    {coupleName(client.partner_one_name, client.partner_two_name)}
                  </Link>
                  {client.email ? <span className="mt-0.5 block text-xs text-muted">{client.email}</span> : null}
                  <span className="mt-2 block">
                    <ContactLinks phone={client.phone} whatsappPhone={whatsappPhones.get(client.id)} />
                  </span>
                  <span className="mt-1 block text-sm text-muted">{client.city || "—"}</span>
                  <span className="mt-1 block text-sm">{formatDate(dates[dates.length - 1], locale)}</span>
                </PhoneCard>
              );
            })
          )
        ) : leadRows.length === 0 ? (
          <EmptyState>{tab === "lost" ? messages.couples.noLost : messages.couples.noOpen}</EmptyState>
        ) : (
          leadRows.map((lead) => (
            <PhoneCard key={lead.id}>
              <span className="flex items-start justify-between gap-3">
                <Link href={`/leads/${lead.id}`} className="font-medium">
                  {coupleName(lead.partner_one_name, lead.partner_two_name)}
                </Link>
                <StatusBadge status={lead.status} />
              </span>
              {lead.city ? <span className="mt-0.5 block text-xs text-muted">{lead.city}</span> : null}
              <span className="mt-2 block">
                <ContactLinks phone={lead.phone} whatsappPhone={whatsappPhones.get(lead.id)} />
              </span>
              <span className="mt-1 block text-sm text-muted">
                {term(messages, lead.source)}
                {lead.wedding_date ? ` · ${formatDate(lead.wedding_date, locale)}` : ""}
              </span>
            </PhoneCard>
          ))
        )}
      </PhoneList>
      <TableCard className="hidden md:block">
        {tab === "booked" ? (
          <table>
            <thead>
              <tr>
                <th>{messages.couples.couple}</th>
                <th>{messages.couples.phone}</th>
                <th>{messages.couples.city}</th>
                <th>{messages.couples.weddingDate}</th>
              </tr>
            </thead>
            <tbody>
              {clientRows.map((client) => {
                const dates = ((client.weddings ?? []) as { wedding_date: string }[]).map((w) => w.wedding_date).sort();
                return (
                  <tr key={client.id}>
                    <td>
                      <Link href={`/clients/${client.id}`} className="font-medium">
                        {coupleName(client.partner_one_name, client.partner_two_name)}
                      </Link>
                      {client.email ? <span className="block text-xs text-muted">{client.email}</span> : null}
                    </td>
                    <td className="whitespace-nowrap"><ContactLinks phone={client.phone} whatsappPhone={whatsappPhones.get(client.id)} /></td>
                    <td>{client.city || "—"}</td>
                    <td className="whitespace-nowrap">{formatDate(dates[dates.length - 1], locale)}</td>
                  </tr>
                );
              })}
              {clientRows.length === 0 ? <EmptyRow colSpan={4}>{messages.couples.noBooked}</EmptyRow> : null}
            </tbody>
          </table>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{messages.couples.couple}</th>
                <th>{messages.couples.phone}</th>
                <th>{messages.couples.source}</th>
                <th>{messages.couples.weddingDate}</th>
                <th>{messages.couples.status}</th>
              </tr>
            </thead>
            <tbody>
              {leadRows.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <Link href={`/leads/${lead.id}`} className="font-medium">
                      {coupleName(lead.partner_one_name, lead.partner_two_name)}
                    </Link>
                    {lead.city ? <span className="block text-xs text-muted">{lead.city}</span> : null}
                  </td>
                  <td className="whitespace-nowrap"><ContactLinks phone={lead.phone} whatsappPhone={whatsappPhones.get(lead.id)} /></td>
                  <td>{term(messages, lead.source)}</td>
                  <td className="whitespace-nowrap">{formatDate(lead.wedding_date, locale)}</td>
                  <td>
                    <StatusBadge status={lead.status} />
                  </td>
                </tr>
              ))}
              {leadRows.length === 0 ? (
                <EmptyRow colSpan={5}>{tab === "lost" ? messages.couples.noLost : messages.couples.noOpen}</EmptyRow>
              ) : null}
            </tbody>
          </table>
        )}
      </TableCard>
      <Pagination page={page} count={total} path="/clients" query={filters} />
    </div>
  );
}
