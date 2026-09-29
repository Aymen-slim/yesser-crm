import Link from "next/link";
import { WeddingForm } from "@/components/record-forms";
import {
  Banner,
  Disclosure,
  EmptyRow,
  FilterTabs,
  PageHeader,
  Pagination,
  StatusBadge,
  TableCard,
  coupleName,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { PAGE_SIZE, WEDDING_STATUSES, formatDate, one } from "@/lib/constants";
import { fill, getMessages, term } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  return { title: getMessages(await getLocale()).nav.weddings };
}

export default async function WeddingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; page?: string; status?: string }>;
}) {
  const profile = await requireUser();
  const locale = await getLocale();
  const messages = getMessages(locale);
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const status = WEDDING_STATUSES.find((value) => value === params.status);
  const admin = profile.role === "admin";
  const supabase = await createClient();

  let query = supabase
    .from("weddings")
    .select("id, wedding_date, start_time, venue_name, city, status, clients(partner_one_name, partner_two_name), packages(name)", { count: "exact" })
    .order("wedding_date", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (status) query = query.eq("status", status);
  if (!admin) {
    const { data: assigned } = await supabase
      .from("wedding_assignments")
      .select("wedding_id")
      .eq("member_id", profile.id);
    const ids = (assigned ?? []).map((row) => row.wedding_id);
    query = query.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }

  const [list, clients, packages] = await Promise.all([
    query,
    admin ? supabase.from("clients").select("id, partner_one_name, partner_two_name").order("partner_one_name") : Promise.resolve({ data: [] }),
    admin ? supabase.from("packages").select("id, name").eq("active", true).order("name") : Promise.resolve({ data: [] }),
  ]);
  const weddingIds = (list.data ?? []).map((wedding) => wedding.id);
  const [extraDays, extraPlaces] = weddingIds.length
    ? await Promise.all([
        supabase.from("wedding_days").select("wedding_id, day_date, label").in("wedding_id", weddingIds).order("day_date"),
        supabase.from("wedding_locations").select("wedding_id, label, venue_name, city").in("wedding_id", weddingIds).order("created_at"),
      ])
    : [{ data: [] }, { data: [] }];
  const daysByWedding = new Map<string, { day_date: string; label: string }[]>();
  for (const day of extraDays.data ?? []) {
    const rows = daysByWedding.get(day.wedding_id) ?? [];
    rows.push({ day_date: day.day_date, label: day.label });
    daysByWedding.set(day.wedding_id, rows);
  }
  const placesByWedding = new Map<string, { label: string; venue_name: string; city: string }[]>();
  for (const spot of extraPlaces.data ?? []) {
    const rows = placesByWedding.get(spot.wedding_id) ?? [];
    rows.push({ label: spot.label, venue_name: spot.venue_name, city: spot.city });
    placesByWedding.set(spot.wedding_id, rows);
  }

  return (
    <div>
      <PageHeader title={messages.weddings.title} subtitle={admin ? messages.weddings.subtitleAdmin : messages.weddings.subtitleMember} />
      <Banner error={params.error} notice={params.notice} />
      {admin ? (
        <Disclosure label={messages.weddings.newWedding} open={Boolean(params.error)}>
          <WeddingForm clients={clients.data ?? []} packages={packages.data ?? []} />
        </Disclosure>
      ) : null}
      <FilterTabs
        active={status ?? "all"}
        items={[
          { value: "all", label: messages.terms.all, href: "/weddings" },
          ...WEDDING_STATUSES.map((value) => ({ value, label: term(messages, value), href: `/weddings?status=${value}` })),
        ]}
      />
      <TableCard>
        <table>
          <thead>
            <tr>
              <th>{messages.weddings.couple}</th>
              <th>{messages.weddings.date}</th>
              <th>{messages.weddings.place}</th>
              <th>{messages.weddings.package}</th>
              <th>{messages.weddings.status}</th>
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((wedding) => {
              const client = one(wedding.clients);
              const pack = one(wedding.packages);
              return (
                <tr key={wedding.id}>
                  <td>
                    <Link href={`/weddings/${wedding.id}`} className="font-medium">
                      {client ? coupleName(client.partner_one_name, client.partner_two_name) : messages.common.wedding}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">
                    {formatDate(wedding.wedding_date, locale)}
                    {wedding.start_time ? <span className="block text-xs text-muted">{wedding.start_time.slice(0, 5)}</span> : null}
                    {(daysByWedding.get(wedding.id) ?? []).map((day) => (
                      <span key={day.day_date} className="block text-xs text-muted">
                        {formatDate(day.day_date, locale)}
                        {day.label ? ` · ${day.label}` : ""}
                      </span>
                    ))}
                  </td>
                  <td>
                    {[wedding.venue_name, wedding.city].filter(Boolean).join(", ") || "—"}
                    {(placesByWedding.get(wedding.id) ?? []).map((spot, index) => (
                      <span key={`${spot.label}-${index}`} className="block text-xs text-muted">
                        {[spot.label, spot.venue_name, spot.city].filter(Boolean).join(", ")}
                      </span>
                    ))}
                  </td>
                  <td className="text-muted">{pack?.name ?? "—"}</td>
                  <td>
                    <StatusBadge status={wedding.status} />
                  </td>
                </tr>
              );
            })}
            {(list.data ?? []).length === 0 ? (
              <EmptyRow colSpan={5}>{status ? fill(messages.weddings.noneStatus, { status: term(messages, status) }) : messages.weddings.none}</EmptyRow>
            ) : null}
          </tbody>
        </table>
      </TableCard>
      <Pagination page={page} count={list.count ?? 0} path="/weddings" query={{ status }} />
    </div>
  );
}
