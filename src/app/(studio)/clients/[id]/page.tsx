import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmit } from "@/components/client";
import { ClientForm } from "@/components/record-forms";
import { Banner, ContactLinks, EmptyState, PageHeader, Section, StatusBadge, coupleName } from "@/components/ui";
import { deleteClient } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/constants";
import { fill, getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";

export default async function ClientPage({
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
  const [{ data: client }, weddings] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    supabase.from("weddings").select("id, wedding_date, venue_name, city, status").eq("client_id", id).order("wedding_date"),
  ]);
  if (!client) notFound();

  return (
    <div>
      <PageHeader
        back={{ href: "/clients?tab=booked", label: messages.nav.couples }}
        title={coupleName(client.partner_one_name, client.partner_two_name)}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <ContactLinks phone={client.phone} whatsappPhone={client.whatsapp_phone} />
            <span>{[client.email, client.city].filter(Boolean).join(" · ")}</span>
          </span>
        }
      />
      <Banner error={error} notice={notice} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Section title={messages.couples.details}>
          <ClientForm client={client} />
          <form action={deleteClient} className="mt-4">
            <input type="hidden" name="id" value={client.id} />
            <ConfirmSubmit
              message={fill(messages.couples.deleteConfirm, {
                name: coupleName(client.partner_one_name, client.partner_two_name),
              })}
            >
              {messages.common.delete}
            </ConfirmSubmit>
          </form>
        </Section>
        <Section title={messages.couples.weddings} className="self-start">
          {(weddings.data ?? []).length === 0 ? (
            <EmptyState>{messages.couples.noWeddings}</EmptyState>
          ) : (
            <ul className="-mx-2">
              {(weddings.data ?? []).map((wedding) => (
                <li key={wedding.id}>
                  <Link
                    href={`/weddings/${wedding.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-sm no-underline hover:bg-canvas"
                  >
                    <span>
                      <span className="block font-medium">{formatDate(wedding.wedding_date, locale)}</span>
                      <span className="block text-xs text-muted">
                        {[wedding.venue_name, wedding.city].filter(Boolean).join(", ") || messages.common.venueNotSet}
                      </span>
                    </span>
                    <StatusBadge status={wedding.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
