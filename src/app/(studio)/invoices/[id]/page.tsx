import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/client";
import { Card, coupleName } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDate, one } from "@/lib/constants";
import { getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { formatRate, formatTnd, invoiceTotals } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  return { title: getMessages(await getLocale()).invoice.title };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const locale = await getLocale();
  const messages = getMessages(locale);
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, number, issued_on, tva_mode, tva_rate_bps, issuer_name, issuer_phone, issuer_address, tax_id, note, wedding_id, weddings(wedding_date, venue_name, city, clients(partner_one_name, partner_two_name)), invoice_lines(label, amount_millimes, position)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!invoice) notFound();

  const wedding = one(invoice.weddings);
  const client = one(wedding?.clients);
  const couple = client ? coupleName(client.partner_one_name, client.partner_two_name) : messages.common.wedding;
  const place = [wedding?.venue_name, wedding?.city].filter(Boolean).join(", ");
  const lines = [...(invoice.invoice_lines ?? [])].sort((a, b) => a.position - b.position);
  const base = lines.reduce((sum, line) => sum + line.amount_millimes, 0);
  const mode = invoice.tva_mode === "added" || invoice.tva_mode === "included" ? invoice.tva_mode : "none";
  const totals = invoiceTotals(base, mode, invoice.tva_rate_bps);

  return (
    <article>
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link href="/payments" className="text-sm text-muted">
          {messages.invoice.back}
        </Link>
        <PrintButton label={messages.invoice.print} />
      </div>
      <Card className="p-8 print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
          <div>
            <p className="font-display text-2xl font-semibold tracking-tight">{invoice.issuer_name}</p>
            {invoice.issuer_address ? <p className="mt-1 text-sm text-muted">{invoice.issuer_address}</p> : null}
            {invoice.issuer_phone ? <p className="text-sm text-muted">{invoice.issuer_phone}</p> : null}
            {invoice.tax_id ? <p className="text-sm text-muted">{messages.invoice.taxId}: {invoice.tax_id}</p> : null}
          </div>
          <div className="text-right">
            <p className="text-xs tracking-[0.16em] text-muted uppercase">{messages.invoice.title}</p>
            <p className="font-display text-2xl font-semibold tracking-tight">{invoice.number}</p>
            <p className="mt-1 text-sm text-muted">{formatDate(invoice.issued_on, locale)}</p>
          </div>
        </header>

        <dl className="grid gap-4 py-6 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">{messages.invoice.couple}</dt>
            <dd className="font-medium">{couple}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{messages.invoice.wedding}</dt>
            <dd className="font-medium">{wedding ? formatDate(wedding.wedding_date, locale) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{messages.invoice.place}</dt>
            <dd className="font-medium">{place || "—"}</dd>
          </div>
        </dl>

        <table>
          <thead>
            <tr>
              <th>{messages.payments.label}</th>
              <th className="text-right">{messages.payments.amount}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={`${line.position}-${line.label}`}>
                <td>{line.label}</td>
                <td className="text-right whitespace-nowrap">{formatTnd(line.amount_millimes)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-6 ml-auto w-full max-w-xs text-sm">
          {mode === "none" ? (
            <div className="flex justify-between gap-4 border-t border-line py-2 font-medium">
              <dt>{messages.invoice.ttc}</dt>
              <dd>{formatTnd(totals.ttc)}</dd>
            </div>
          ) : (
            <>
              <div className="flex justify-between gap-4 py-1">
                <dt className="text-muted">{messages.invoice.ht}</dt>
                <dd>{formatTnd(totals.ht)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-1">
                <dt className="text-muted">{messages.invoice.tvaAmount} {formatRate(invoice.tva_rate_bps)}</dt>
                <dd>{formatTnd(totals.tva)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-line py-2 font-medium">
                <dt>{messages.invoice.ttc}</dt>
                <dd>{formatTnd(totals.ttc)}</dd>
              </div>
            </>
          )}
        </dl>
        {invoice.note ? <p className="mt-6 text-sm text-muted">{invoice.note}</p> : null}
      </Card>
    </article>
  );
}
