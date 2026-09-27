import Link from "next/link";
import { notFound } from "next/navigation";
import { ConvertForm, LeadForm, NoteForm } from "@/components/record-forms";
import { Banner, EmptyState, PageHeader, Section, StatusBadge, coupleName } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/constants";
import { fill, getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";

export default async function LeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await requireAdmin();
  const locale = await getLocale();
  const messages = getMessages(locale);
  const { id } = await params;
  const { error, notice } = await searchParams;
  const supabase = await createClient();
  const [{ data: lead }, packages, notes] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).maybeSingle(),
    supabase.from("packages").select("id, name, price_millimes").eq("active", true).order("name"),
    supabase.from("notes").select("id, body, created_at").eq("lead_id", id).order("created_at", { ascending: false }),
  ]);
  if (!lead) notFound();

  const { count: takenCount } = lead.wedding_date && !lead.converted_client_id
    ? await supabase
        .from("weddings")
        .select("id", { count: "exact", head: true })
        .eq("wedding_date", lead.wedding_date)
        .neq("status", "cancelled")
    : { count: 0 };

  return (
    <div>
      <PageHeader
        back={{ href: "/clients?tab=leads", label: messages.nav.couples }}
        title={coupleName(lead.partner_one_name, lead.partner_two_name)}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={lead.status} />
            <span>{lead.phone}</span>
            {lead.wedding_date ? <span>· {fill(messages.lead.weddingOn, { date: formatDate(lead.wedding_date, locale) })}</span> : null}
          </span>
        }
      />
      <Banner error={error} notice={notice} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-6">
          {lead.converted_client_id ? (
            <Section title={messages.lead.booked}>
              <p className="text-sm">
                {messages.lead.nowCouple} <Link href={`/clients/${lead.converted_client_id}`}>{messages.lead.openCouple}</Link>
              </p>
            </Section>
          ) : (
            <Section title={messages.lead.book}>
              {(takenCount ?? 0) > 0 ? (
                <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {fill(messages.lead.taken, { date: formatDate(lead.wedding_date, locale) })}
                </p>
              ) : null}
              <ConvertForm
                leadId={lead.id}
                packages={packages.data ?? []}
                defaults={{
                  wedding_date: lead.wedding_date,
                  venue: lead.venue,
                  city: lead.city,
                  package_id: lead.package_id,
                }}
              />
            </Section>
          )}
          <Section title={messages.lead.details}>
            <LeadForm lead={lead} packages={packages.data ?? []} />
          </Section>
        </div>

        <Section title={messages.lead.notes} className="self-start">
          {(notes.data ?? []).length === 0 ? (
            <EmptyState>{messages.lead.noNotes}</EmptyState>
          ) : (
            <ul className="flex flex-col gap-3">
              {(notes.data ?? []).map((note) => (
                <li key={note.id} className="rounded-lg bg-canvas px-3 py-2.5 text-sm">
                  <p className="whitespace-pre-wrap">{note.body}</p>
                  <span className="mt-1 block text-xs text-muted">{formatDate(note.created_at.slice(0, 10), locale)}</span>
                </li>
              ))}
            </ul>
          )}
          <NoteForm leadId={lead.id} />
        </Section>
      </div>
    </div>
  );
}
