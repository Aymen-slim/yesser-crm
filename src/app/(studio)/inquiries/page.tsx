import Link from "next/link";
import { Banner, ContactLinks, EmptyRow, EmptyState, PageHeader, Pagination, PhoneCard, PhoneList, StatusBadge, TableCard } from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { PAGE_SIZE, formatDate } from "@/lib/constants";
import { getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  return { title: getMessages(await getLocale()).nav.inquiries };
}

export default async function InquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; page?: string }>;
}) {
  await requireManager();
  const locale = await getLocale();
  const messages = getMessages(locale);
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const supabase = await createClient();
  const inquiries = await supabase
    .from("inquiries")
    .select("id, name, email, phone, venue, wedding_date_text, status, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (inquiries.error) {
    console.error("Inquiries lookup failed:", inquiries.error.code);
    throw new Error("inquiries_failed");
  }
  const rows = inquiries.data ?? [];
  const total = inquiries.count ?? 0;

  return (
    <div>
      <PageHeader title={messages.nav.inquiries} subtitle={messages.inquiries.subtitle} />
      <Banner error={params.error} notice={params.notice} />
      <PhoneList>
        {rows.length === 0 ? (
          <EmptyState>{messages.inquiries.empty}</EmptyState>
        ) : (
          rows.map((inquiry) => (
            <PhoneCard key={inquiry.id}>
              <span className="flex items-start justify-between gap-3">
                <Link href={`/inquiries/${inquiry.id}`} className="font-medium">
                  {inquiry.name}
                </Link>
                <StatusBadge status={inquiry.status} />
              </span>
              <span className="mt-2 block">
                {inquiry.phone ? <ContactLinks phone={inquiry.phone} /> : null}
                {inquiry.email ? <a href={`mailto:${encodeURIComponent(inquiry.email)}`}>{inquiry.email}</a> : null}
              </span>
              <span className="mt-1 block text-sm text-muted">
                {inquiry.venue || "—"}
                {inquiry.wedding_date_text ? ` · ${inquiry.wedding_date_text}` : ""}
              </span>
            </PhoneCard>
          ))
        )}
      </PhoneList>
      <TableCard className="hidden md:block">
        <table>
          <thead>
            <tr>
              <th>{messages.couples.filterName}</th>
              <th>{messages.inquiries.contact}</th>
              <th>{messages.forms.venue}</th>
              <th>{messages.inquiries.date}</th>
              <th>{messages.inquiries.received}</th>
              <th>{messages.couples.status}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((inquiry) => (
              <tr key={inquiry.id}>
                <td>
                  <Link href={`/inquiries/${inquiry.id}`} className="font-medium">
                    {inquiry.name}
                  </Link>
                </td>
                <td className="whitespace-nowrap">
                  {inquiry.phone ? <ContactLinks phone={inquiry.phone} /> : null}
                  {inquiry.email ? <span className="block text-xs text-muted">{inquiry.email}</span> : null}
                </td>
                <td>{inquiry.venue || "—"}</td>
                <td>{inquiry.wedding_date_text || "—"}</td>
                <td className="whitespace-nowrap">{formatDate(inquiry.created_at.slice(0, 10), locale)}</td>
                <td>
                  <StatusBadge status={inquiry.status} />
                </td>
              </tr>
            ))}
            {rows.length === 0 ? <EmptyRow colSpan={6}>{messages.inquiries.empty}</EmptyRow> : null}
          </tbody>
        </table>
      </TableCard>
      <Pagination page={page} count={total} path="/inquiries" />
    </div>
  );
}
