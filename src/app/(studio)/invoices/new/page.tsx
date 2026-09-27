import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceForm } from "@/components/record-forms";
import { Banner, EmptyState, PageHeader, coupleName } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDate, one } from "@/lib/constants";
import { getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  return { title: getMessages(await getLocale()).invoice.newTitle };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ wedding?: string; error?: string; notice?: string }>;
}) {
  const profile = await requireAdmin();
  const locale = await getLocale();
  const messages = getMessages(locale);
  const params = await searchParams;
  const weddingId = params.wedding ?? "";
  if (!UUID.test(weddingId)) notFound();

  const supabase = await createClient();
  const [wedding, payments, last, me, existing] = await Promise.all([
    supabase
      .from("weddings")
      .select("id, wedding_date, venue_name, city, clients(partner_one_name, partner_two_name)")
      .eq("id", weddingId)
      .maybeSingle(),
    supabase.from("payments").select("id, label, amount_millimes, due_date").eq("wedding_id", weddingId).order("due_date", { nullsFirst: false }),
    supabase.from("invoices").select("issuer_name, issuer_phone, issuer_address, tax_id").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("profiles").select("phone").eq("id", profile.id).maybeSingle(),
    supabase.from("invoices").select("id, number, issued_on").eq("wedding_id", weddingId).order("issued_on", { ascending: false }),
  ]);

  if (!wedding.data) notFound();
  const client = one(wedding.data.clients);
  const couple = client ? coupleName(client.partner_one_name, client.partner_two_name) : messages.common.wedding;
  const place = [wedding.data.venue_name, wedding.data.city].filter(Boolean).join(", ");
  const issuer = {
    name: last.data?.issuer_name || profile.full_name,
    phone: last.data?.issuer_phone || me.data?.phone || "",
    address: last.data?.issuer_address || "",
    taxId: last.data?.tax_id || "",
  };
  const lines = payments.data ?? [];

  return (
    <div>
      <PageHeader
        title={messages.invoice.newTitle}
        subtitle={`${couple} · ${formatDate(wedding.data.wedding_date, locale)}${place ? ` · ${place}` : ""}`}
        action={
          <Link href={`/weddings/${weddingId}`} className="button ghost no-underline">
            {messages.invoice.wedding}
          </Link>
        }
      />
      <Banner error={params.error} notice={params.notice} />
      {(existing.data ?? []).length > 0 ? (
        <p className="mb-6 text-sm text-muted">
          <span className="font-medium text-ink">{messages.invoice.existing}: </span>
          {(existing.data ?? []).map((invoice, index) => (
            <span key={invoice.id}>
              {index > 0 ? ", " : null}
              <Link href={`/invoices/${invoice.id}`}>{invoice.number}</Link>
            </span>
          ))}
        </p>
      ) : null}
      {lines.length === 0 ? (
        <EmptyState>{messages.invoice.noPayments}</EmptyState>
      ) : (
        <InvoiceForm weddingId={weddingId} payments={lines} issuer={issuer} />
      )}
    </div>
  );
}
