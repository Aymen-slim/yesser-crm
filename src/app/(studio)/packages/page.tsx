import Link from "next/link";
import { ConfirmSubmit } from "@/components/client";
import { ExtraForm, PackageForm } from "@/components/record-forms";
import { Badge, Banner, Card, Disclosure, EmptyState, PageHeader, Section } from "@/components/ui";
import { deleteExtra } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth";
import { fill, getMessages } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { formatTnd } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata() {
  return { title: getMessages(await getLocale()).nav.packages };
}

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await requireAdmin();
  const messages = getMessages(await getLocale());
  const { error, notice } = await searchParams;
  const supabase = await createClient();
  const [{ data }, { data: extras }] = await Promise.all([
    supabase
      .from("packages")
      .select("id, name, description, price_millimes, coverage_hours, photo_count, includes_album, includes_video, includes_drone, active, features")
      .order("active", { ascending: false })
      .order("price_millimes"),
    supabase.from("extras").select("id, name, price_millimes, active").order("active", { ascending: false }).order("name"),
  ]);

  return (
    <div>
      <PageHeader title={messages.packages.title} subtitle={messages.packages.subtitle} />
      <Banner error={error} notice={notice} />
      <Disclosure label={messages.packages.newPackage} open={Boolean(error)}>
        <PackageForm />
      </Disclosure>
      {(data ?? []).length === 0 ? (
        <Card>
          <EmptyState>{messages.packages.empty}</EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((item) => {
            const extras = [
              item.includes_album && messages.terms.album,
              item.includes_video && messages.terms.video,
              item.includes_drone && messages.terms.drone,
            ].filter(Boolean) as string[];
            const features = (Array.isArray(item.features) ? item.features : []).filter((line): line is string => typeof line === "string");
            return (
              <Link key={item.id} href={`/packages/${item.id}`} className="no-underline">
                <Card className={`flex h-full flex-col p-6 transition-shadow hover:shadow-[0_12px_32px_rgba(0,0,0,0.06)] ${item.active ? "" : "opacity-60"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-display text-xl font-semibold tracking-tight">{item.name}</h2>
                    {item.active ? null : <Badge>{messages.packages.hidden}</Badge>}
                  </div>
                  <p className="mt-2 text-lg font-medium tracking-tight">{formatTnd(item.price_millimes)}</p>
                  {features.length ? (
                    <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm">
                      {features.map((line, index) => (
                        <li key={`${index}-${line}`}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <>
                      {item.description ? <p className="mt-3 line-clamp-3 text-sm text-muted">{item.description}</p> : null}
                      <p className="mt-auto pt-4 text-xs text-muted">
                        {fill(messages.packages.coverage, { hours: item.coverage_hours, count: item.photo_count })}
                      </p>
                      {extras.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {extras.map((extra) => (
                            <Badge key={extra} tone="amber">
                              {extra}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <Section title={messages.packages.extrasTitle} className="mt-8">
        <p className="mb-4 text-sm text-muted">{messages.packages.extrasSubtitle}</p>
        <Disclosure label={messages.packages.newExtra}>
          <ExtraForm />
        </Disclosure>
        {(extras ?? []).length === 0 ? (
          <EmptyState>{messages.packages.emptyExtras}</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {(extras ?? []).map((item) => (
              <li key={item.id} className={`py-4 ${item.active ? "" : "opacity-60"}`}>
                <ExtraForm item={item} />
                <form action={deleteExtra} className="mt-2">
                  <input type="hidden" name="id" value={item.id} />
                  <ConfirmSubmit message={fill(messages.packages.deleteExtra, { name: item.name })}>{messages.common.delete}</ConfirmSubmit>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
