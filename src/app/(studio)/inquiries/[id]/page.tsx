import Link from "next/link";
import { notFound } from "next/navigation";
import { PhoneInput, SubmitButton } from "@/components/client";
import { Banner, ContactLinks, Field, PageHeader, Section, StatusBadge } from "@/components/ui";
import { addInquiryAsLead } from "@/lib/actions";
import { requireManager } from "@/lib/auth";
import { formatDate } from "@/lib/constants";
import { getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function generateMetadata() {
  return { title: getMessages(await getLocale()).nav.inquiries };
}

export default async function InquiryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await requireManager();
  const locale = await getLocale();
  const messages = getMessages(locale);
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { error, notice } = await searchParams;
  const supabase = await createClient();
  const { data: inquiry, error: lookupError } = await supabase.from("inquiries").select("*").eq("id", id).maybeSingle();
  if (lookupError) {
    console.error("Inquiry lookup failed:", lookupError.code);
    throw new Error("inquiries_failed");
  }
  if (!inquiry) notFound();

  const rows = [
    [messages.inquiries.instagram, inquiry.instagram],
    [messages.inquiries.date, inquiry.wedding_date_text],
    [messages.forms.venue, inquiry.venue],
    [messages.inquiries.guests, inquiry.guest_count],
    [messages.inquiries.planner, inquiry.planner],
    [messages.inquiries.foundOn, inquiry.found_on],
  ].filter(([, value]) => value);

  return (
    <div>
      <PageHeader
        back={{ href: "/inquiries", label: messages.nav.inquiries }}
        title={inquiry.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={inquiry.status} />
            <span>{formatDate(inquiry.created_at.slice(0, 10), locale)}</span>
          </span>
        }
      />
      <Banner error={error} notice={notice} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Section title={messages.inquiries.letter}>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted">{label}</dt>
                <dd className="mt-1 whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
            <div>
              <dt className="text-muted">{messages.inquiries.contact}</dt>
              <dd className="mt-1">
                {inquiry.phone ? <ContactLinks phone={inquiry.phone} /> : null}
                {inquiry.email ? (
                  <a className="block" href={`mailto:${encodeURIComponent(inquiry.email)}`}>
                    {inquiry.email}
                  </a>
                ) : null}
              </dd>
            </div>
          </dl>
        </Section>
        <Section title={messages.inquiries.addLead} className="self-start">
          {inquiry.lead_id ? (
            <Link href={`/leads/${inquiry.lead_id}`}>{messages.inquiries.openLead}</Link>
          ) : (
            <form action={addInquiryAsLead} className="grid gap-4">
              <input type="hidden" name="id" value={inquiry.id} />
              {inquiry.status === "added" ? <p className="text-sm text-muted">{messages.inquiries.removedLead}</p> : null}
              {inquiry.phone ? null : (
                <Field label={messages.inquiries.phoneToAdd}>
                  <PhoneInput name="phone" required error={messages.flash.err_phone} />
                  <span className="text-xs text-muted">{messages.inquiries.phoneHint}</span>
                </Field>
              )}
              <SubmitButton pendingLabel={messages.common.adding}>{messages.inquiries.addLead}</SubmitButton>
            </form>
          )}
        </Section>
      </div>
    </div>
  );
}
