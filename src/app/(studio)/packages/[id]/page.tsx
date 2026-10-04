import { notFound } from "next/navigation";
import { ConfirmSubmit } from "@/components/client";
import { PackageForm } from "@/components/record-forms";
import { Banner, PageHeader, Section } from "@/components/ui";
import { deletePackage } from "@/lib/actions";
import { requireManager } from "@/lib/auth";
import { fill, getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { formatTnd } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export default async function PackagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireManager();
  const messages = getMessages(await getLocale());
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("packages").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const features: string[] = (Array.isArray(data.features) ? data.features : []).filter(
    (line: unknown): line is string => typeof line === "string" && line.trim().length > 0,
  );
  return (
    <div className="max-w-3xl">
      <PageHeader
        back={{ href: "/packages", label: messages.nav.packages }}
        title={data.name}
        subtitle={formatTnd(data.price_millimes)}
      />
      <Banner error={error} />
      {features.length ? (
        <ul className="mb-6 list-disc space-y-1.5 pl-5 text-sm">
          {features.map((line, index) => (
            <li key={`${index}-${line}`}>{line}</li>
          ))}
        </ul>
      ) : null}
      <Section title={messages.packages.details}>
        <PackageForm item={data} />
        <form action={deletePackage} className="mt-4">
          <input type="hidden" name="id" value={data.id} />
          <ConfirmSubmit message={fill(messages.packages.deleteConfirm, { name: data.name })}>
            {messages.common.delete}
          </ConfirmSubmit>
        </form>
      </Section>
    </div>
  );
}
