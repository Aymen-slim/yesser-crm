import { notFound } from "next/navigation";
import { PackageForm } from "@/components/record-forms";
import { Banner, PageHeader, Section } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { createClient } from "@/lib/supabase/server";

export default async function PackagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const messages = getMessages(await getLocale());
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("packages").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  return (
    <div className="max-w-3xl">
      <PageHeader back={{ href: "/packages", label: messages.nav.packages }} title={data.name} />
      <Banner error={error} />
      <Section title={messages.packages.details}>
        <PackageForm item={data} />
      </Section>
    </div>
  );
}
